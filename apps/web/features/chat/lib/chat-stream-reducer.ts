import type { ChatMessage, ChatError } from "../types";

/**
 * apps/web/features/chat/lib/chat-stream-reducer.ts
 *
 * Phase 4b (docs/FRONTEND_REBUILD_PLAN.md). D3: a custom, pure reducer
 * rather than the AI SDK's `useChat` — this app's stream is plain-text
 * deltas over a custom `/api/chat` contract (F2 in the plan's audit),
 * not the AI SDK's own protocol, and 4b's own spec text says "built on
 * a pure reducer" directly.
 *
 * Deliberately separate from use-chat-stream.ts: every transition here
 * is a plain function of (state, action) → state, with no `fetch`,
 * `AbortController`, or timers involved, so chat-stream-reducer.test.ts
 * exercises every branch without mocking the network at all. The hook
 * (use-chat-stream.ts) owns everything IMPURE — issuing the request,
 * reading the stream, wiring Stop to an AbortController — and only ever
 * talks to this file through `dispatch`.
 *
 * IN-FLIGHT GUARD (why CHUNK/DONE/PARTIAL/ERROR check `state.status`
 * before touching state): once a stream has been stopped (or has
 * errored, or a *different* stream has since started via retry), a
 * stray async callback from the OLD stream can still resolve late — the
 * reader's `read()` promise it's awaiting doesn't stop just because
 * `AbortController.abort()` was called; cancellation is cooperative,
 * not instant. Without this guard, that late callback would silently
 * resurrect content into a conversation the user already told to stop,
 * or double-append into a message a retry has already replaced. Every
 * mutating action below is a no-op unless the reducer is still in the
 * exact in-flight state that action expects.
 */

export type ChatStreamStatus =
  | "idle"
  | "sending"
  | "streaming"
  | "done"
  | "stopped"
  | "error"
  | "partial";

export interface ChatStreamState {
  status: ChatStreamStatus;
  messages: ChatMessage[];
  error: ChatError | null;
}

export type ChatStreamAction =
  | { type: "SEND"; userMessage: ChatMessage; assistantMessageId: string }
  | { type: "EDIT_SEND"; truncateBeforeId: string; userMessage: ChatMessage; assistantMessageId: string }
  | { type: "CHUNK"; id: string; delta: string }
  | { type: "DONE"; id: string }
  | { type: "STOP"; id: string }
  | { type: "PARTIAL"; id: string }
  | { type: "ERROR"; id: string; error: ChatError }
  | { type: "RESET_ERROR" };

export const initialChatStreamState: ChatStreamState = {
  status: "idle",
  messages: [],
  error: null,
};

const IN_FLIGHT: ReadonlySet<ChatStreamStatus> = new Set(["sending", "streaming"]);

function replaceMessage(
  messages: ChatMessage[],
  id: string,
  update: (m: ChatMessage) => ChatMessage,
): ChatMessage[] {
  return messages.map((m) => (m.id === id ? update(m) : m));
}

export function chatStreamReducer(
  state: ChatStreamState,
  action: ChatStreamAction,
): ChatStreamState {
  switch (action.type) {
    case "SEND": {
      // Send-lock: a second SEND while one is already in flight is
      // ignored outright — no queuing, no replacing. The caller
      // (use-chat-stream.ts) is expected to disable the send affordance
      // during "sending"/"streaming" too; this is the correctness
      // backstop for a race (e.g. a keyboard-repeat Enter) that gets
      // through anyway.
      if (IN_FLIGHT.has(state.status)) return state;
      return {
        status: "sending",
        error: null,
        messages: [...state.messages, action.userMessage],
      };
    }

    case "EDIT_SEND": {
      // Editing a past user turn. Same in-flight guard as SEND (no
      // editing while a stream is already running). Unlike SEND, this
      // also drops the edited message itself and EVERYTHING after it —
      // that's the whole point of an edit: the old assistant reply (and
      // any further turns) answered a question that no longer exists,
      // so they're replaced by whatever the new send produces, not kept
      // alongside it. If `truncateBeforeId` isn't found (edited message
      // already gone — e.g. a retry/edit race), this is a no-op rather
      // than silently appending onto the wrong point in history.
      if (IN_FLIGHT.has(state.status)) return state;
      const idx = state.messages.findIndex((m) => m.id === action.truncateBeforeId);
      if (idx === -1) return state;
      return {
        status: "sending",
        error: null,
        messages: [...state.messages.slice(0, idx), action.userMessage],
      };
    }

    case "CHUNK": {
      // First chunk of a turn arrives while status is still "sending"
      // — this is what actually flips it to "streaming" (there is no
      // separate STREAM_START action; the first byte back from the
      // server IS the signal). Lazily creates the assistant's draft
      // message on that first chunk rather than at SEND, so a turn
      // that errors before any content ever appears leaves no empty
      // assistant row behind (see the ERROR branch).
      if (state.status !== "sending" && state.status !== "streaming") return state;
      const exists = state.messages.some((m) => m.id === action.id);
      if (!exists) {
        const draft: ChatMessage = {
          id: action.id,
          role: "assistant",
          content: action.delta,
          createdAt: new Date().toISOString(),
          isPartial: false,
        };
        return { ...state, status: "streaming", messages: [...state.messages, draft] };
      }
      return {
        ...state,
        status: "streaming",
        messages: replaceMessage(state.messages, action.id, (m) => ({
          ...m,
          content: m.content + action.delta,
        })),
      };
    }

    case "DONE": {
      if (state.status !== "sending" && state.status !== "streaming") return state;
      return { ...state, status: "done" };
    }

    case "STOP": {
      if (state.status !== "sending" && state.status !== "streaming") return state;
      const hasContent = state.messages.some((m) => m.id === action.id && m.content.length > 0);
      return {
        ...state,
        status: "stopped",
        // Nothing streamed yet when Stop landed — drop the empty draft
        // rather than leaving a blank assistant bubble in the
        // transcript. Otherwise mark it partial: the server-side
        // contract (Phase 4's "chat contract" note) persists whatever
        // was received with isPartial: true and bills for it, so the
        // client's own view must match what actually got saved/billed.
        messages: hasContent
          ? replaceMessage(state.messages, action.id, (m) => ({ ...m, isPartial: true }))
          : state.messages.filter((m) => m.id !== action.id),
      };
    }

    case "PARTIAL": {
      if (state.status !== "sending" && state.status !== "streaming") return state;
      const hasContent = state.messages.some((m) => m.id === action.id && m.content.length > 0);
      return {
        ...state,
        status: "partial",
        messages: hasContent
          ? replaceMessage(state.messages, action.id, (m) => ({ ...m, isPartial: true }))
          : state.messages.filter((m) => m.id !== action.id),
      };
    }

    case "ERROR": {
      if (state.status !== "sending" && state.status !== "streaming") return state;
      // types.ts's own contract: a gateway error is never persisted as
      // a message row (B1's streamChat replies JSON and inserts
      // nothing), so a draft with no content yet is removed here too —
      // it never became a real turn, on the server or in this list.
      return {
        ...state,
        status: "error",
        error: action.error,
        messages: state.messages.filter((m) => !(m.id === action.id && m.content.length === 0)),
      };
    }

    case "RESET_ERROR": {
      if (state.status !== "error") return state;
      return { ...state, status: "idle", error: null };
    }

    default:
      return state;
  }
}
