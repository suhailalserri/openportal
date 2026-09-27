"use client";

import * as React from "react";

import { DEFAULT_CONVERSATION_PARAMS, type ConversationParams } from "../types";
import { readParams, writeParams } from "../lib/chat-params-storage";

export interface UseChatParamsOptions {
  /** undefined until a conversation exists. */
  conversationId: string | undefined;
}

export interface UseChatParamsResult {
  params: ConversationParams;
  setParams: (next: ConversationParams) => void;
}

/**
 * apps/web/features/chat/hooks/use-chat-params.ts
 *
 * Owns the generation parameters for one conversation — temperature /
 * top_p / max_tokens — client-side only, keyed by conversation id (see
 * lib/chat-params-storage.ts for why these aren't server-persisted).
 *
 * There used to also be a user-editable `systemPrompt` half here (loaded
 * via GET, saved via a debounced PATCH). That's been removed entirely —
 * product decision: users don't get a custom system prompt. Whatever
 * "rules" the assistant follows now come from the server-owned
 * platform/model prompts assembled in gateway.service.ts
 * (history-compaction.service.ts's `buildSystemPrompt`), which this
 * client never reads, sets, or overrides.
 */
export function useChatParams({ conversationId }: UseChatParamsOptions): UseChatParamsResult {
  const [params, setParamsState] = React.useState<ConversationParams>(DEFAULT_CONVERSATION_PARAMS);

  React.useEffect(() => {
    setParamsState(conversationId ? readParams(conversationId) : DEFAULT_CONVERSATION_PARAMS);
  }, [conversationId]);

  const setParams = React.useCallback(
    (next: ConversationParams) => {
      setParamsState(next);
      // No id yet → held in state only; it is written once an id exists
      // (see the effect below), so a draft made before the first send isn't lost.
      if (conversationId) writeParams(conversationId, next);
    },
    [conversationId],
  );

  // A conversation id can appear AFTER params were set (first send creates
  // it). Persist whatever the user had chosen under the new id.
  const prevIdRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const prev = prevIdRef.current;
    prevIdRef.current = conversationId;
    if (conversationId && prev === undefined) writeParams(conversationId, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on id transition
  }, [conversationId]);

  return { params, setParams };
}
