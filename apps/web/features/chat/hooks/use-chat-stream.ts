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
  /** Edits a past USER turn: truncates that message and everything
   *  after it (its old assistant reply included), then sends `content`
   *  as a new turn in its place. See EDIT_SEND in chat-stream-reducer.ts
   *  for exactly what "everything after it" means. No-ops if a stream is
   *  already in flight (same guard as `send`) or if `id` is no longer in
   *  `state.messages` (e.g. a race with something else that already
   *  changed the history). */
  edit: (id: string, content: string) => void;
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

  // Shared by `send` and `edit`: identical stream-event wiring in both
  // cases (coalesced CHUNK flush, DONE/STOP/PARTIAL/ERROR dispatch) —
  // the only thing that differs between the two callers is which
  // reducer action starts the turn (SEND vs EDIT_SEND) and what request
  // body goes over the wire, both handled by the caller before this is
  // invoked.
  const makeCallbacks = React.useCallback(
    (assistantMessageId: string) => ({
      onChunk: (delta: string) => {
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
      onError: (error: { message: string; retryable: boolean; redirectTo?: string | undefined }) => {
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
    }),
    [scheduleFlush, flushNow],
  );

  // Shared by `send` and `edit`: the optional-field-omission dance is
  // identical either way (see the inline comments this was lifted from,
  // originally only in `send`, for exactly why each field is built as a
  // local const and conditionally spread rather than inlined).
  //
  // `messages: ChatMessage[]` (types.ts) keeps `role: ChatMessageRole`
  // ("user" | "assistant" | "system") for display purposes, but the wire
  // payload's role union was tightened to "user" | "assistant" only when
  // the server stopped accepting a client-supplied "system" role at all
  // (see chat.schema.ts / stream-reader.ts's ChatStreamRequestBody). A
  // "system" entry should never actually be in this hook's own message
  // list in practice (nothing in this file ever pushes one — the server
  // prepends its own system message separately, never round-tripped back
  // into state), but mapping straight from ChatMessage's wider role type
  // is what TS is correctly refusing to let through un-narrowed. Filter
  // rather than cast: an unexpected "system" row silently vanishing from
  // an outgoing request is a much safer failure than plainly asserting a
  // type that might not hold.
  const buildRequestBody = React.useCallback(
    (messages: ChatMessage[]) => {
      const temperature = params?.temperature;
      const topP = params?.topP;
      const maxTokens = params?.maxTokens;
      return {
        model,
        conversationId,
        messages: messages
          .filter((m): m is ChatMessage & { role: "user" | "assistant" } =>
            m.role === "user" || m.role === "assistant")
          .map(({ role, content: c }) => ({ role, content: c })),
        ...(temperature != null ? { temperature } : {}),
        ...(topP != null ? { top_p: topP } : {}),
        ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
      };
    },
    [model, conversationId, params],
  );

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
        buildRequestBody([...stateRef.current.messages, userMessage]),
        controller.signal,
        makeCallbacks(assistantMessageId),
      );
    },
    [buildRequestBody, makeCallbacks],
  );

  const edit = React.useCallback(
    (id: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (stateRef.current.status === "sending" || stateRef.current.status === "streaming") return;

      // Computed here (not left to the reducer) because the REQUEST body
      // needs the truncated history too, not just the reducer's next
      // state — same reason `send` above builds its own array rather
      // than reading it back off `dispatch`'s return value (reducers
      // don't have one). If `id` isn't found, EDIT_SEND's own reducer
      // branch also no-ops, so nothing is sent to the server either.
      const idx = stateRef.current.messages.findIndex((m) => m.id === id);
      if (idx === -1) return;
      const historyBefore = stateRef.current.messages.slice(0, idx);

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
        isPartial: false,
      };
      const assistantMessageId = crypto.randomUUID();
      lastSentRef.current = trimmed;
      dispatch({ type: "EDIT_SEND", truncateBeforeId: id, userMessage, assistantMessageId });

      const controller = new AbortController();
      controllerRef.current = controller;

      void runChatStream(
        buildRequestBody([...historyBefore, userMessage]),
        controller.signal,
        makeCallbacks(assistantMessageId),
      );
    },
    [buildRequestBody, makeCallbacks],
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

  return { ...state, send, edit, stop, retry };
}
