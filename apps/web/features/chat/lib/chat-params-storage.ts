import { registerClientCacheClearer } from "@/lib/client-cache";
import { DEFAULT_CONVERSATION_PARAMS, type ConversationParams } from "../types";

/**
 * apps/web/features/chat/lib/chat-params-storage.ts
 *
 * Phase 4c. Client-side persistence for two things:
 *   1. the last-picked model id, and
 *   2. per-conversation temperature / top_p / max_tokens.
 *
 * WHY temperature/top_p/max_tokens ARE CLIENT-SIDE: B1's contract persists
 * only `systemPrompt` on the conversation (FRONTEND_REBUILD_PLAN.md §7,
 * B1: "persist `systemPrompt` on the conversation"). The `conversations`
 * table has no columns for the other three (packages/db/src/schema/
 * conversations.ts) and PATCH /api/conversations/[id] does not accept
 * them. Both are in the frozen zone, so this phase does not add them.
 * The three numeric params are therefore saved here and re-sent on every
 * message — they persist per conversation on this browser, NOT across
 * devices. The system prompt is the exception and persists server-side.
 * If cross-device persistence for the numeric params is wanted later,
 * that is a backend session (three nullable columns + PATCH body), and
 * this module becomes a thin fallback.
 *
 * RULE 9 (privacy on shared devices): everything here is per-account
 * (a model choice and generation settings are account preferences, per
 * lib/client-cache.ts's own header). Every key shares one prefix and the
 * registered clearer removes by PREFIX — not by a known key list —
 * because per-conversation keys are unbounded (one per conversation id)
 * and a hand-maintained list would miss them.
 *
 * All access is guarded: localStorage can throw (Safari private mode,
 * storage disabled, quota exceeded) and can be absent during SSR. A
 * failure here must never break sending a message.
 */

export const CHAT_STORAGE_PREFIX = "aip.chat.";
const LAST_MODEL_KEY = `${CHAT_STORAGE_PREFIX}lastModel`;
const paramsKey = (conversationId: string) => `${CHAT_STORAGE_PREFIX}params.${conversationId}`;

/** Minimal surface we need; lets tests pass a fake without a DOM. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

function getStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    // Accessing window.localStorage itself can throw (SecurityError).
    return undefined;
  }
}

// ── last model ────────────────────────────────────────────────────────
export function readLastModel(storage: StorageLike | undefined = getStorage()): string | undefined {
  try {
    const v = storage?.getItem(LAST_MODEL_KEY);
    return v ? v : undefined;
  } catch {
    return undefined;
  }
}

export function writeLastModel(
  modelId: string,
  storage: StorageLike | undefined = getStorage(),
): void {
  try {
    storage?.setItem(LAST_MODEL_KEY, modelId);
  } catch {
    // Quota/private-mode: losing "remember last model" is harmless.
  }
}

// ── per-conversation numeric params ───────────────────────────────────
/**
 * Parsed defensively: this is data from localStorage, which any script on
 * the origin (or a previous app version) may have written. Anything that
 * is not a finite number in its valid range falls back to "unset" (null)
 * rather than being sent to the server, which would 400 on it.
 */
function num(v: unknown, min: number, max: number, integer = false): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  if (integer && !Number.isInteger(v)) return null;
  return v;
}

/** Validation ranges — must match apps/api/src/schemas/chat.schema.ts. */
export const PARAM_LIMITS = {
  temperature: { min: 0, max: 2 },
  topP: { min: 0, max: 1 },
  /** Server ceiling; the real per-model clamp is applied server-side too. */
  maxTokens: { min: 1, max: 1_000_000 },
} as const;

export function sanitizeParams(raw: unknown): ConversationParams {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    temperature: num(o.temperature, PARAM_LIMITS.temperature.min, PARAM_LIMITS.temperature.max),
    topP: num(o.topP, PARAM_LIMITS.topP.min, PARAM_LIMITS.topP.max),
    maxTokens: num(o.maxTokens, PARAM_LIMITS.maxTokens.min, PARAM_LIMITS.maxTokens.max, true),
  };
}

export function readParams(
  conversationId: string,
  storage: StorageLike | undefined = getStorage(),
): ConversationParams {
  try {
    const raw = storage?.getItem(paramsKey(conversationId));
    if (!raw) return { ...DEFAULT_CONVERSATION_PARAMS };
    return sanitizeParams(JSON.parse(raw));
  } catch {
    // Corrupt JSON or blocked storage → behave as "never set".
    return { ...DEFAULT_CONVERSATION_PARAMS };
  }
}

export function writeParams(
  conversationId: string,
  params: ConversationParams,
  storage: StorageLike | undefined = getStorage(),
): void {
  try {
    if (!storage) return;
    const clean = sanitizeParams(params);
    // All-default → remove the key instead of storing a row of nulls.
    if (clean.temperature === null && clean.topP === null && clean.maxTokens === null) {
      storage.removeItem(paramsKey(conversationId));
      return;
    }
    storage.setItem(paramsKey(conversationId), JSON.stringify(clean));
  } catch {
    // Same reasoning as writeLastModel.
  }
}

// ── sign-out clearing (Rule 9) ────────────────────────────────────────
/**
 * Removes every key under CHAT_STORAGE_PREFIX. Iterates a SNAPSHOT of the
 * keys first: removing while walking `storage.key(i)` shifts the indices
 * and would skip every other entry.
 */
export function clearChatStorage(storage: StorageLike | undefined = getStorage()): void {
  try {
    if (!storage) return;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k !== null && k.startsWith(CHAT_STORAGE_PREFIX)) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    // clearAllClientCaches already tolerates a clearer failing; nothing
    // useful to add here.
  }
}

registerClientCacheClearer(() => clearChatStorage());
