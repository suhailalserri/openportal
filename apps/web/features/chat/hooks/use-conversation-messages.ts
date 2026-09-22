"use client";

import * as React from "react";

import { useSession } from "@/lib/auth-client";
import { fetchConversationMessages, fetchConversationModelId } from "../lib/conversation-api";
import { readCachedMessages, writeCachedMessages } from "../lib/conversation-cache";
import { getRealIdbStore } from "../lib/idb-store";
import type { ChatMessage } from "../types";

export interface UseConversationMessagesResult {
  /** Cache-first: populated from IndexedDB on mount if a prior visit
   *  cached this conversation, then replaced once the network resolves.
   *  Empty array (not undefined) for a conversation with no history yet
   *  — including a brand-new, not-yet-inserted one (see
   *  fetchConversationMessages's 404-as-empty handling), so a caller
   *  never has to distinguish "still loading" from "no messages" by
   *  checking this field; use `isLoading` for that. */
  messages: ChatMessage[];
  /** True only until there is SOMETHING to show (cache or network) —
   *  mirrors use-conversations.ts's own isLoading contract, for the same
   *  reason: a background refetch must not blank an already-painted
   *  conversation. `undefined` conversationId (the /chat empty state,
   *  before a first send) is never "loading" — there is nothing to
   *  load yet. */
  isLoading: boolean;
  isError: boolean;
  /**
   * Phase 4d patch. This EXISTING conversation's own model, once known —
   * fed straight into `useChatModels({ conversationModelId })` so an
   * existing conversation's picker reflects the model it was actually
   * built with instead of always falling back to the user's last-picked
   * global default. Cache-only paint never has this (the cached message
   * array does not carry the conversation row's own modelId column) — it
   * only becomes defined once the network call resolves, same as every
   * other network-only field in this codebase's cache-first hooks. A
   * brand-new conversation (no id, or an id with no server row yet)
   * simply never gets one, which `useChatModels` already treats as "fall
   * through to the next tier" (its own resolveSelectedModelId contract).
   */
  conversationModelId: string | undefined;
}

/**
 * apps/web/features/chat/hooks/use-conversation-messages.ts
 *
 * Phase 4d. `/chat/[id]`'s history loader — the counterpart to
 * use-conversations.ts (the sidebar's LIST loader), same cache-first-
 * then-network shape, but keyed by one conversation id instead of the
 * whole list. chat-view.tsx feeds this hook's `messages` into
 * `useChatStream`'s new `initialMessages` option (see that hook's
 * header comment for why seeding happens there and not here) as the
 * starting point for a conversation that already has history; this hook
 * itself does not know anything about live streaming.
 *
 * CACHE WRITE-BACK ONLY ON A REAL FETCH: unlike use-conversations.ts
 * (which caches every successful list fetch), this hook also skips
 * writing to cache when `conversationId` is undefined or when the
 * network call fails — there is nothing meaningful to persist for either
 * case, and writing an empty array over a real cached history on a
 * transient network failure would erase a legitimate cache entry for no
 * reason.
 */
export function useConversationMessages(
  conversationId: string | undefined,
): UseConversationMessagesResult {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [hasAnyData, setHasAnyData] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [conversationModelId, setConversationModelId] = React.useState<string | undefined>(
    undefined,
  );

  React.useEffect(() => {
    if (!userId || !conversationId) {
      setMessages([]);
      setHasAnyData(false);
      setIsLoading(false);
      setIsError(false);
      setConversationModelId(undefined);
      return;
    }

    let cancelled = false;
    setIsError(false);
    setHasAnyData(false);
    setIsLoading(true);

    // 1. Cache-first paint.
    void (async () => {
      const store = getRealIdbStore();
      const cached = await readCachedMessages(userId, conversationId, store);
      if (cancelled) return;
      if (cached) {
        setMessages(cached);
        setHasAnyData(true);
        setIsLoading(false);
      }
    })();

    // 2. Network refresh — always runs, even after a cache hit.
    void (async () => {
      const result = await fetchConversationMessages(conversationId);
      if (cancelled) return;
      if (!result.ok) {
        setIsError(true);
        setIsLoading(false);
        return;
      }
      setMessages(result.value);
      setHasAnyData(true);
      setIsLoading(false);
      const store = getRealIdbStore();
      await writeCachedMessages(userId, conversationId, result.value, store);
    })();

    // 2b. The conversation's own modelId — a second, independent GET to
    // the same endpoint (see fetchConversationModelId's own header
    // comment for why this isn't folded into the call above). Failure
    // here is NOT surfaced as this hook's isError: the picker's fallback
    // chain (useChatModels) already degrades gracefully to the user's
    // last-picked model when this stays undefined, so one extra fetch
    // failing must not block or error out the whole conversation view
    // over a purely cosmetic model-preselection detail.
    void (async () => {
      const result = await fetchConversationModelId(conversationId);
      if (cancelled) return;
      setConversationModelId(result.ok ? result.value : undefined);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, conversationId]);

  return { messages, isLoading: isLoading && !hasAnyData, isError, conversationModelId };
}
