/**
 * apps/web/features/chat/lib/conversation-cache.ts
 *
 * Phase 4d. Client-side cache for two things, so `/chat/[id]` and the
 * sidebar can paint from disk before the network round-trip finishes:
 *   1. the sidebar's conversation LIST (one array under one key), and
 *   2. per-conversation MESSAGE lists (one array per conversation id).
 * Backed by `idb-keyval` (already a package.json dependency, previously
 * unused anywhere in this repo — this is its first real call site).
 *
 * WHY AN INJECTABLE STORE INTERFACE, NOT A DIRECT idb-keyval IMPORT
 * THROUGHOUT: this repo's `vitest.config.ts` runs `environment: "node"`
 * (see that file's own header comment) — there is no `indexedDB` global
 * and no `fake-indexeddb` dependency in this sandbox to add one, so a
 * test that calls real `idb-keyval` functions would simply throw
 * "indexedDB is not defined" in CI, not fail meaningfully. Every
 * function in this file that has real logic worth testing (key
 * building, namespacing by user id, eviction, what counts as "this
 * user's data") takes a `KVStore` parameter and defaults it to the real
 * `idb-keyval` adapter — the exact same shape `chat-params-storage.ts`
 * uses for `localStorage` (a `StorageLike` param defaulting to
 * `window.localStorage`), for the same reason. `conversation-cache.test.ts`
 * exercises everything through a small in-memory fake `KVStore`; the
 * three-line adapter at the bottom of this file that actually calls
 * `idb-keyval` is the one piece that stays unverified until CI/preview
 * (flagged in the phase's "not verified" section).
 *
 * NAMESPACING BY USER ID (Rule 9 — shared-device privacy): every key
 * this module writes is prefixed `aip.chat.{userId}.`. This is a
 * DIFFERENT scheme from `chat-params-storage.ts`'s localStorage keys
 * (prefixed `aip.chat.` with NO user id, relying entirely on
 * `clearChatStorage()` running before the next sign-in). Both are valid
 * ways to satisfy Rule 9, but IndexedDB specifically also has to survive
 * a person signing out and a DIFFERENT person signing in on the same
 * device WITHOUT a full page reload in between (e.g. two people sharing
 * a kiosk tab, one clicking "sign out" and handing the laptop to the
 * next person, who signs in without the tab ever closing) — a
 * prefix-based clear-on-signout is a single point of failure if that
 * clear is ever skipped (a thrown error mid-clear, a browser tab that
 * was already navigating away). Namespacing every key by user id makes a
 * missed clear merely WASTEFUL (an old user's dead entries sit unread
 * under a prefix nothing will ever request again) rather than a PRIVACY
 * FAILURE (the next user's queries would never read another user's
 * prefix in the first place, clear or no clear). The sign-out clearer
 * (registered below) still runs, as defense in depth and to actually
 * free the space — this is "also namespace", not "namespace instead of
 * clearing".
 *
 * EVICTION: the list cache holds one entry (the whole array, already
 * capped at 50 by the server); message caches are capped at
 * MAX_CACHED_CONVERSATIONS distinct conversation ids, evicting the
 * least-recently-WRITTEN one (an in-memory LRU tracked via a small
 * index entry, `aip.chat.{userId}.__index`) once the cap is exceeded —
 * an unbounded per-conversation-id key set would otherwise grow forever
 * for a long-lived account with thousands of past conversations.
 */
import { registerClientCacheClearer } from "@/lib/client-cache";
import type { ChatMessage } from "../types";
import type { ConversationSummary } from "../types";

export const CACHE_PREFIX = "aip.chat.";
const MAX_CACHED_CONVERSATIONS = 30;

/** Minimal surface this module needs from a key-value store — satisfied
 *  by both the real idb-keyval adapter (bottom of this file) and any
 *  test's in-memory fake. Intentionally NOT idb-keyval's own exact
 *  signature (no `IDBObjectStore`/custom-store param) so a test fake
 *  never has to pretend to be idb-keyval, just a plain async map. */
export interface KVStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

function listKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}.list`;
}
function messagesKey(userId: string, conversationId: string): string {
  return `${CACHE_PREFIX}${userId}.messages.${conversationId}`;
}
function indexKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}.__index`;
}

/** Swallows store errors the same way chat-params-storage.ts swallows
 *  localStorage errors (Safari private mode, quota, a closed IDB
 *  connection): a cache miss must never break sending a message or
 *  loading a conversation — the caller always has the network as the
 *  real source of truth and treats this purely as a fast-path. */
async function safeGet<T>(store: KVStore, key: string): Promise<T | undefined> {
  try {
    const v = await store.get(key);
    return v as T | undefined;
  } catch {
    return undefined;
  }
}
async function safeSet(store: KVStore, key: string, value: unknown): Promise<void> {
  try {
    await store.set(key, value);
  } catch {
    // Losing a cache write is harmless — the next network fetch repopulates it.
  }
}
async function safeDel(store: KVStore, key: string): Promise<void> {
  try {
    await store.del(key);
  } catch {
    // Same reasoning as safeSet.
  }
}

// ── conversation list ───────────────────────────────────────────────
export async function readCachedConversationList(
  userId: string,
  store: KVStore,
): Promise<ConversationSummary[] | undefined> {
  return safeGet<ConversationSummary[]>(store, listKey(userId));
}

export async function writeCachedConversationList(
  userId: string,
  items: readonly ConversationSummary[],
  store: KVStore,
): Promise<void> {
  await safeSet(store, listKey(userId), items);
}

// ── per-conversation messages, with a small LRU index ────────────────
interface CacheIndex {
  /** Conversation ids with a cached message list, oldest-written first. */
  order: string[];
}

async function readIndex(userId: string, store: KVStore): Promise<CacheIndex> {
  const raw = await safeGet<CacheIndex>(store, indexKey(userId));
  return raw && Array.isArray(raw.order) ? raw : { order: [] };
}

async function touchIndex(userId: string, conversationId: string, store: KVStore): Promise<string[]> {
  const idx = await readIndex(userId, store);
  const withoutCurrent = idx.order.filter((id) => id !== conversationId);
  const next = [...withoutCurrent, conversationId]; // most-recently-written goes last
  // Split point clamped at 0: `next.length - MAX` goes negative whenever
  // we're still under the cap, and a negative `slice` start counts from
  // the array's END rather than meaning "0" — using it unclamped here
  // silently drops entries well before the cap is ever reached (caught
  // by this file's own eviction test, which failed against the first,
  // unclamped version of this line before the fix).
  const splitAt = Math.max(0, next.length - MAX_CACHED_CONVERSATIONS);
  const evicted = next.slice(0, splitAt);
  const kept = next.slice(splitAt);
  await safeSet(store, indexKey(userId), { order: kept } satisfies CacheIndex);
  return evicted;
}

/** P6.3e (session 53). An empty list is never a cache hit: it only ever means "nothing known yet" (a
 *  brand-new chat's first fetch answers "no messages", 404-as-empty), and treating it as a hit opened the
 *  chat empty while the real history was still loading. */
export function isUsableCachedMessages(cached: readonly ChatMessage[] | undefined): cached is ChatMessage[] {
  return Array.isArray(cached) && cached.length > 0;
}

/** P6.3e (session 53). Only a non-empty server answer is worth caching (see isUsableCachedMessages). */
export function shouldCacheMessages(fetched: readonly ChatMessage[]): boolean {
  return fetched.length > 0;
}

export async function readCachedMessages(
  userId: string,
  conversationId: string,
  store: KVStore,
): Promise<ChatMessage[] | undefined> {
  return safeGet<ChatMessage[]>(store, messagesKey(userId, conversationId));
}

export async function writeCachedMessages(
  userId: string,
  conversationId: string,
  messages: readonly ChatMessage[],
  store: KVStore,
): Promise<void> {
  await safeSet(store, messagesKey(userId, conversationId), messages);
  const evicted = await touchIndex(userId, conversationId, store);
  await Promise.all(evicted.map((id) => safeDel(store, messagesKey(userId, id))));
}

export async function deleteCachedMessages(
  userId: string,
  conversationId: string,
  store: KVStore,
): Promise<void> {
  await safeDel(store, messagesKey(userId, conversationId));
  const idx = await readIndex(userId, store);
  await safeSet(store, indexKey(userId), {
    order: idx.order.filter((id) => id !== conversationId),
  } satisfies CacheIndex);
}

// ── sign-out clearing (Rule 9) ────────────────────────────────────────
/**
 * Removes every cached entry for ONE user. Called with the signed-in
 * user's own id right before sign-out (see the registration below) —
 * NOT a wildcard "clear everything under aip.chat." sweep, because (per
 * this file's header comment) a stray entry under a DIFFERENT user's
 * namespace must never be touched by this user's sign-out; each user's
 * data is only ever removed by that same user's own future sign-out
 * (or never, if they don't come back — see MAX_CACHED_CONVERSATIONS for
 * why that's bounded waste, not unbounded).
 */
export async function clearConversationCacheForUser(userId: string, store: KVStore): Promise<void> {
  const idx = await readIndex(userId, store);
  await Promise.all([
    safeDel(store, listKey(userId)),
    safeDel(store, indexKey(userId)),
    ...idx.order.map((id) => safeDel(store, messagesKey(userId, id))),
  ]);
}

// ── real idb-keyval adapter + sign-out registration ───────────────────
/**
 * The one part of this file real vitest coverage cannot reach (see this
 * file's header comment) — a thin pass-through to idb-keyval's module-
 * level `get`/`set`/`del`, which operate on one shared default store.
 * Kept to exactly three lines each so there is as little unverified
 * surface as possible; all real logic above takes `store` as a
 * parameter and is fully covered against the in-memory fake.
 */
let idbAdapter: KVStore | undefined;
async function getIdbAdapter(): Promise<KVStore> {
  if (!idbAdapter) {
    const idb = await import("idb-keyval");
    idbAdapter = {
      get: (key) => idb.get(key),
      set: (key, value) => idb.set(key, value),
      del: (key) => idb.del(key),
    };
  }
  return idbAdapter;
}

/** Registered once at module load, mirroring chat-params-storage.ts's
 *  own `registerClientCacheClearer(() => clearChatStorage())` call at
 *  its file's bottom. Needs the signed-in user's id, which this module
 *  cannot read on its own (no session access in a pure lib file, by the
 *  same design as every other features/chat/lib module) — so the
 *  registered clearer is a function that reads the id from a small
 *  module-level box `setActiveUserId` writes to, rather than this
 *  module importing `useSession` and becoming a React hook. See
 *  hooks/use-conversation-cache-identity.ts for the one call site that
 *  keeps this box in sync with the real session.
 */
let activeUserId: string | undefined;
export function setActiveUserIdForCacheClearing(userId: string | undefined): void {
  activeUserId = userId;
}

registerClientCacheClearer(async () => {
  if (!activeUserId) return;
  const store = await getIdbAdapter();
  await clearConversationCacheForUser(activeUserId, store);
});
