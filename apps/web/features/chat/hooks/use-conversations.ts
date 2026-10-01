"use client";

import * as React from "react";

import { useSession } from "@/lib/auth-client";
import {
  listConversations,
  renameConversation,
  pinConversation,
  deleteConversation,
} from "../lib/conversation-api";
import {
  readCachedConversationList,
  writeCachedConversationList,
  deleteCachedMessages,
} from "../lib/conversation-cache";
import { getRealIdbStore } from "../lib/idb-store";
import type { ConversationSummary } from "../types";

export interface UseConversationsResult {
  /** Cache-first: populated instantly from IndexedDB if a prior visit
   *  cached anything, then replaced once the network call resolves. */
  conversations: ConversationSummary[];
  /** True only while there is NO data to show yet at all (neither cache
   *  nor network) — a background refresh with cached data already on
   *  screen does not flip this back to true, so the sidebar never blanks
   *  out on every remount. */
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** Optimistic: flips isPinned locally immediately, PATCHes, and rolls
   *  back on failure. */
  togglePin: (id: string, next: boolean) => void;
  /** Optimistic rename with rollback on failure. */
  rename: (id: string, title: string) => void;
  /** Optimistic remove-from-list with rollback on failure. Also evicts
   *  that conversation's cached messages (deleteCachedMessages) since a
   *  soft-deleted conversation should not still serve stale cached
   *  content if its id is ever revisited directly by URL. */
  remove: (id: string) => void;
}

/**
 * apps/web/features/chat/hooks/use-conversations.ts
 *
 * Phase 4d. The sidebar's data source. Deliberately plain `fetch` +
 * `useState`/`useEffect`, NOT `trpc.*.useQuery` — conversations are one
 * of L5's named REST exceptions (no tRPC procedure exists for them; see
 * conversation-api.ts's header comment), so there is no React Query
 * cache to lean on here the way use-chat-models.ts leans on
 * `trpc.models.list.useQuery`. The IndexedDB cache (conversation-
 * cache.ts) is this hook's OWN substitute for that: read synchronously-
 * ish on mount (an effect, since IndexedDB is inherently async) before
 * the network call resolves, so the sidebar has something to paint
 * immediately on a repeat visit instead of a loading skeleton every time.
 *
 * OPTIMISTIC UPDATES: pin/rename/remove update local state (and the
 * IndexedDB cache) immediately, before the PATCH/DELETE round-trip
 * resolves, then roll back to the pre-optimistic snapshot if the request
 * fails. This mirrors the UX users expect from every mainstream chat
 * product's sidebar (instant pin toggle, instant delete) without waiting
 * on a network round-trip for a purely cosmetic action — but ALWAYS
 * rolls back on failure rather than assuming success, since Rule 1's
 * spirit ("the UI shows server results") extends here even though pin/
 * rename aren't money: a permanently-wrong-looking sidebar after a
 * failed request would be its own kind of lie to the user.
 */
export function useConversations(): UseConversationsResult {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [hasAnyData, setHasAnyData] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    if (!userId) {
      setConversations([]);
      setHasAnyData(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsError(false);

    // 1. Cache-first paint.
    void (async () => {
      const store = getRealIdbStore();
      const cached = await readCachedConversationList(userId, store);
      if (cancelled) return;
      if (cached) {
        setConversations(cached);
        setHasAnyData(true);
        setIsLoading(false);
      }
    })();

    // 2. Network refresh — always runs, even after a cache hit, so the
    //    list is never stale for longer than one round-trip.
    void (async () => {
      const result = await listConversations();
      if (cancelled) return;
      if (!result.ok) {
        setIsError(true);
        setIsLoading(false);
        return;
      }
      setConversations(result.value);
      setHasAnyData(true);
      setIsLoading(false);
      const store = getRealIdbStore();
      await writeCachedConversationList(userId, result.value, store);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, refreshTick]);

  const refetch = React.useCallback(() => setRefreshTick((n) => n + 1), []);

  const togglePin = React.useCallback(
    (id: string, next: boolean) => {
      const snapshot = conversations;
      setConversations((cur) => cur.map((c) => (c.id === id ? { ...c, isPinned: next } : c)));
      void pinConversation(id, next).then((r) => {
        if (!r.ok) setConversations(snapshot);
      });
    },
    [conversations],
  );

  const rename = React.useCallback(
    (id: string, title: string) => {
      const snapshot = conversations;
      const trimmed = title.trim();
      if (!trimmed) return;
      setConversations((cur) => cur.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
      void renameConversation(id, trimmed).then((r) => {
        if (!r.ok) setConversations(snapshot);
      });
    },
    [conversations],
  );

  const remove = React.useCallback(
    (id: string) => {
      const snapshot = conversations;
      setConversations((cur) => cur.filter((c) => c.id !== id));
      void deleteConversation(id).then(async (r) => {
        if (!r.ok) {
          setConversations(snapshot);
          return;
        }
        if (userId) {
          const store = getRealIdbStore();
          await deleteCachedMessages(userId, id, store);
        }
      });
    },
    [conversations, userId],
  );

  // P6.3c: a chat whose row was created for an attachment but never got a message has no title yet.
  // Hide it until it does (it gets its title when its first message is sent). Rows that were titled
  // before this change are unaffected.
  const visibleConversations = React.useMemo(
    () => conversations.filter((c) => typeof c.title === "string" && c.title.trim().length > 0),
    [conversations],
  );

  return {
    conversations: visibleConversations,
    isLoading: isLoading && !hasAnyData,
    isError,
    refetch,
    togglePin,
    rename,
    remove,
  };
}
