"use client";

import * as React from "react";

import {
  chatStreamReducer,
  initialChatStreamState,
  type ChatStreamState,
} from "../lib/chat-stream-reducer";
import { runChatStream } from "../lib/stream-reader";
import type { ChatMessage } from "../types";

export interface UseChatStreamOptions {
  /** undefined until a conversation exists (features/chat's own
   *  POST /api/conversations create call, wired by whoever calls this
   *  hook — out of this hook's scope, see this file's header comment). */
  conversationId: string | undefined;
  model: string;
}

export interface UseChatStreamResult extends ChatStreamState {
  send: (content: string) => void;
  stop: () => void;
  retry: () => void;
}

/**
 * apps/web/features/chat/hooks/use-chat-stream.ts
 *
 * Phase 4b. Owns exactly: the AbortController lifecycle (Stop),
 * dispatching into chat-stream-reducer.ts, and calling
 * stream-reader.ts's runChatStream. Deliberately does NOT own:
 * - Creating the conversation (`POST /api/conversations`) — the caller
 *   passes `conversationId` in once it exists; 4d wires the actual
 *   create-then-send flow into a real route.
 * - Persisting/restoring messages (IndexedDB cache, `4d`).
 * - The input bar, model picker, or token-limit warning (`4c`).
 * This hook's only contract is: give it a conversationId + model +
 * strings to send, get back a message list and a status a UI can render
 * — features/chat/components already know how to render exactly this
 * shape (MessageList's `messages`/`error` props, Message's
 * `isPartial`/streaming-cursor handling).
 *
 * 401 MID-STREAM: stream-reader.ts surfaces it as a normal ERROR with
 * `retryable: false` and `redirectTo` set — this hook does not redirect
 * itself (a hook has no router access by design here); the caller reads
 * `error`/`redirectTo` off a rejected send and performs the redirect
 * with `lib/safe-redirect.ts`'s `sanitizeNext()`, per Rule 4 (client
 * checks are UX only, but the redirect target itself must still be
 * sanitized the same way a server guard would).
 */
export function useChatStream({ conversationId, model }: UseChatStreamOptions): UseChatStreamResult {
  const [state, dispatch] = React.useReducer(chatStreamReducer, initialChatStreamState);
  const controllerRef = React.useRef<AbortController | null>(null);
  const lastSentRef = React.useRef<string | null>(null);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const send = React.useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (stateRef.current.status === "sending" || stateRef.current.status === "streaming") return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
        isPartial: false,
      };
      const assistantMessageId = crypto.randomUUID();
      lastSentRef.current = trimmed;
      dispatch({ type: "SEND", userMessage, assistantMessageId });

      const controller = new AbortController();
      controllerRef.current = controller;

      void runChatStream(
        {
          model,
          conversationId,
          messages: [...stateRef.current.messages, userMessage].map(({ role, content: c }) => ({
            role,
            content: c,
          })),
        },
        controller.signal,
        {
          onChunk: (delta) => dispatch({ type: "CHUNK", id: assistantMessageId, delta }),
          onDone: () => dispatch({ type: "DONE", id: assistantMessageId }),
          onStopped: () => dispatch({ type: "STOP", id: assistantMessageId }),
          onPartial: () => dispatch({ type: "PARTIAL", id: assistantMessageId }),
          onError: (error) =>
            dispatch({
              type: "ERROR",
              id: assistantMessageId,
              error: {
                id: crypto.randomUUID(),
                message: error.message,
                retryable: error.retryable,
                redirectTo: error.redirectTo,
              },
            }),
        },
      );
    },
    [model, conversationId],
  );

  const stop = React.useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const retry = React.useCallback(() => {
    if (state.status !== "error" || !lastSentRef.current) return;
    dispatch({ type: "RESET_ERROR" });
    send(lastSentRef.current);
  }, [state.status, send]);

  // Abort any in-flight stream on unmount (route change, sign-out) so a
  // late callback never fires into a reducer no component is reading
  // anymore, and so the browser actually stops the network request.
  React.useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  return { ...state, send, stop, retry };
}
