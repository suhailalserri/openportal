"use client";

import * as React from "react";

import {
  chatStreamReducer,
  initialChatStreamState,
  type ChatStreamState,
} from "../lib/chat-stream-reducer";
import { runChatStream } from "../lib/stream-reader";
import type { ChatMessage, ConversationParams } from "../types";

export interface UseChatStreamOptions {
  /** undefined until a conversation exists (features/chat's own
   *  POST /api/conversations create call, wired by whoever calls this
   *  hook — out of this hook's scope, see this file's header comment). */
  conversationId: string | undefined;
  model: string;
  /** Phase 4c. `null` = unset → omitted from the request entirely so the
   *  provider's own default applies (see ConversationParams in types.ts). */
  params?: ConversationParams | undefined;
  /** Phase 4c. Persisted server-side by B1 on first send; empty/whitespace
   *  is treated as "no system prompt" and omitted. */
  systemPrompt?: string | undefined;
  /** Phase 4d. Seeds this hook's message list for a conversation that
   *  already has history (`/chat/[id]`, loaded by
   *  use-conversation-messages.ts). Applied via `useReducer`'s LAZY-INIT
   *  form (the third argument below) — meaning it is read EXACTLY ONCE,
   *  on this hook's first render for a given component instance, and
   *  every render after that is ignored. This is deliberate, not an
   *  oversight: once a stream is live, `state.messages` is this hook's
   *  own source of truth (it's what SEND/CHUNK/DONE mutate), so a prop
   *  that kept re-seeding on every parent re-render would either fight
   *  the reducer for ownership of the array or silently discard
   *  in-progress streamed content the moment the parent re-rendered for
   *  an unrelated reason. Because of the once-only read, the CALLER is
   *  responsible for only mounting this hook once real history has
   *  actually arrived — chat-view.tsx's `ChatSession` split (mounted
   *  only once `useConversationMessages` resolves, remounted via `key`
   *  on every conversation switch) exists specifically to satisfy this
   *  contract; passing a not-yet-loaded empty array here and expecting
   *  a later prop change to backfill it will NOT work. */
  initialMessages?: ChatMessage[] | undefined;
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
export function useChatStream({
  conversationId,
  model,
  params,
  systemPrompt,
  initialMessages,
}: UseChatStreamOptions): UseChatStreamResult {
  // Lazy-init (the 3-argument form): `initialChatStreamState` is passed
  // as the reducer's default and `init` (third arg) only runs ONCE, on
  // this component instance's first render, regardless of how many times
  // `initialMessages` itself changes on later renders — see this option's
  // doc comment above for why that's required, not incidental.
  const [state, dispatch] = React.useReducer(
    chatStreamReducer,
    initialChatStreamState,
    (base) => (initialMessages && initialMessages.length > 0 ? { ...base, messages: initialMessages } : base),
  );
  const controllerRef = React.useRef<AbortController | null>(null);
  const lastSentRef = React.useRef<string | null>(null);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  // Chunk-coalescing buffer for the in-flight stream. `onChunk` below is
  // called once per `reader.read()` resolution in stream-reader.ts — on a
  // fast connection / small provider chunks that can be many times a
  // frame. Every one of those used to go straight to `dispatch`, which
  // re-renders `MessageList` and re-runs `SafeMarkdown` (react-markdown +
  // remarkGfm + rehypeHighlight) over the ENTIRE accumulated message
  // string each time — cost that grows with message length, so more
  // chunks in = quadratic-ish total work, which is what actually made
  // long responses visibly slow down partway through (not a network or
  // reducer issue; both were already correct — see stream-reader.ts and
  // chat-stream-reducer.ts's own header comments).
  //
  // Fix: accumulate deltas here and flush at most once per animation
  // frame via a single CHUNK dispatch of the coalesced buffer. This
  // bounds re-render/re-highlight frequency to ~60/s regardless of how
  // many network chunks arrive in that window, while the reducer's
  // append-only CHUNK handling means coalescing N deltas into one is
  // byte-for-byte identical to applying them one at a time — no output
  // difference, just fewer, larger appends.
  const pendingDeltaRef = React.useRef("");
  const flushHandleRef = React.useRef<number | null>(null);

  const scheduleFlush = React.useCallback((id: string) => {
    if (flushHandleRef.current !== null) return;
    flushHandleRef.current = requestAnimationFrame(() => {
      flushHandleRef.current = null;
      if (pendingDeltaRef.current.length === 0) return;
      const delta = pendingDeltaRef.current;
      pendingDeltaRef.current = "";
      dispatch({ type: "CHUNK", id, delta });
    });
  }, []);

  // Synchronously drain whatever hasn't been flushed yet — used at
  // stream end (onDone/onStopped/onPartial/onError all arrive AFTER the
  // last onChunk, but a pending rAF flush may not have fired yet) so the
  // final byte of content is never left stuck in the buffer.
  const flushNow = React.useCallback((id: string) => {
    if (flushHandleRef.current !== null) {
      cancelAnimationFrame(flushHandleRef.current);
      flushHandleRef.current = null;
    }
    if (pendingDeltaRef.current.length === 0) return;
    const delta = pendingDeltaRef.current;
    pendingDeltaRef.current = "";
    dispatch({ type: "CHUNK", id, delta });
  }, []);

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

      // Build optional fields conditionally so an unset param is ABSENT
      // from the object, not present-as-undefined (exactOptionalPropertyTypes)
      // and never `null` (the server's schema rejects null).
      // Local consts (not `params?.temperature` inside the ternary) so
      // `!= null` narrows a plain identifier — narrowing on an optional-
      // chained property path is not reliably carried into the true
      // branch, and a `number | null` leaking into a `number | undefined`
      // field is exactly the exactOptionalPropertyTypes failure class.
      const temperature = params?.temperature;
      const topP = params?.topP;
      const maxTokens = params?.maxTokens;
      const trimmedSystemPrompt = systemPrompt?.trim();
      void runChatStream(
        {
          model,
          conversationId,
          messages: [...stateRef.current.messages, userMessage].map(({ role, content: c }) => ({
            role,
            content: c,
          })),
          ...(temperature != null ? { temperature } : {}),
          ...(topP != null ? { top_p: topP } : {}),
          ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
          ...(trimmedSystemPrompt ? { systemPrompt: trimmedSystemPrompt } : {}),
        },
        controller.signal,
        {
          onChunk: (delta) => {
            pendingDeltaRef.current += delta;
            scheduleFlush(assistantMessageId);
          },
          onDone: () => {
            flushNow(assistantMessageId);
            dispatch({ type: "DONE", id: assistantMessageId });
          },
          onStopped: () => {
            flushNow(assistantMessageId);
            dispatch({ type: "STOP", id: assistantMessageId });
          },
          onPartial: () => {
            flushNow(assistantMessageId);
            dispatch({ type: "PARTIAL", id: assistantMessageId });
          },
          onError: (error) => {
            // No flushNow here: ERROR's own reducer branch (chat-stream-
            // reducer.ts) drops the draft entirely when content.length
            // === 0 at the moment the action lands. Flushing a pending
            // buffer first would give the draft nonzero content and
            // change ERROR's behavior for a case it was never meant to
            // cover (Phase 4b's contract: a gateway error is never a
            // persisted/partial message). ERROR only ever fires from
            // stream-reader.ts before any onChunk in practice (a
            // mid-stream network drop surfaces as onPartial, not
            // onError) but the buffer is cleared here defensively so a
            // stale delta can't leak into whatever comes after.
            pendingDeltaRef.current = "";
            if (flushHandleRef.current !== null) {
              cancelAnimationFrame(flushHandleRef.current);
              flushHandleRef.current = null;
            }
            dispatch({
              type: "ERROR",
              id: assistantMessageId,
              error: {
                id: crypto.randomUUID(),
                message: error.message,
                retryable: error.retryable,
                redirectTo: error.redirectTo,
              },
            });
          },
        },
      );
    },
    [model, conversationId, params, systemPrompt],
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
    return () => {
      controllerRef.current?.abort();
      if (flushHandleRef.current !== null) cancelAnimationFrame(flushHandleRef.current);
    };
  }, []);

  return { ...state, send, stop, retry };
}
