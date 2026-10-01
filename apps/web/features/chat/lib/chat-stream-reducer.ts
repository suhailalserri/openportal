import type { ChatMessage, ChatError, ThinkingTrace } from "../types";

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
 *
 * P6.3a (structured stream, behind the admin's Thinking switch). Two additions, both
 * inert unless the v2 stream is on: a THINKING action (reasoning text goes to
 * `message.thinking`, never into `content`, so it is never saved, billed as
 * answer text or sent back to the model as history) and a STATUS action
 * (`statusCode`, shown as a status line until the first content). The old
 * CHUNK/DONE/STOP/PARTIAL/ERROR actions behave exactly as before when their
 * new optional `at` field is absent, which is how every v1 caller and every
 * pre-P6.3 test dispatches them. Timestamps come in on the actions (`at`,
 * epoch ms) so this stays a pure function.
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
  /** P6.3a. The server's progress code for the turn in flight (today only
   *  "waiting"), or null. Set only while no content has arrived; cleared by the
   *  first thinking/text and by every end-of-turn action. */
  statusCode: string | null;
}

export type ChatStreamAction =
  | { type: "SEND"; userMessage: ChatMessage; assistantMessageId: string }
  | { type: "EDIT_SEND"; truncateBeforeId: string; userMessage: ChatMessage; assistantMessageId: string }
  | { type: "CHUNK"; id: string; delta: string; at?: number }
  | { type: "THINKING"; id: string; delta: string; at: number }
  | { type: "STATUS"; code: string }
  | { type: "DONE"; id: string; at?: number }
  | { type: "STOP"; id: string; at?: number }
  | { type: "PARTIAL"; id: string; at?: number }
  | { type: "ERROR"; id: string; error: ChatError }
  | { type: "RESET_ERROR" }
  /** P6.3e (session 53). Fresh history from the server for a session that has not sent anything yet. */
  | { type: "HISTORY_LOADED"; messages: ChatMessage[] };

export const initialChatStreamState: ChatStreamState = {
  status: "idle",
  messages: [],
  error: null,
  statusCode: null,
};

const IN_FLIGHT: ReadonlySet<ChatStreamStatus> = new Set(["sending", "streaming"]);

function replaceMessage(
  messages: ChatMessage[],
  id: string,
  update: (m: ChatMessage) => ChatMessage,
): ChatMessage[] {
  return messages.map((m) => (m.id === id ? update(m) : m));
}

/** Stamps `endedAt` on a message's thinking the first time it is closed. */
function closeThinking(m: ChatMessage, at: number | undefined): ChatMessage {
  const t = m.thinking;
  if (!t || t.endedAt !== undefined || at === undefined) return m;
  const closed: ThinkingTrace = { ...t, endedAt: at };
  return { ...m, thinking: closed };
}

/** A draft worth keeping when a turn is cut short: it has answer text OR reasoning. */
function hasAnything(m: ChatMessage): boolean {
  return m.content.length > 0 || (m.thinking?.text.length ?? 0) > 0;
}

/** Same list for display purposes: same ids, same text, same reasoning length, same partial flag. */
function sameMessages(a: readonly ChatMessage[], b: readonly ChatMessage[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((m, i) => {
    const o = b[i];
    return (
      o !== undefined &&
      m.id === o.id &&
      m.content === o.content &&
      m.isPartial === o.isPartial &&
      (m.thinking?.text.length ?? 0) === (o.thinking?.text.length ?? 0)
    );
  });
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
        statusCode: null,
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
        statusCode: null,
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
        return { ...state, status: "streaming", statusCode: null, messages: [...state.messages, draft] };
      }
      return {
        ...state,
        status: "streaming",
        statusCode: null,
        messages: replaceMessage(state.messages, action.id, (m) =>
          // Answer text starting ends the reasoning phase (P6.3a). A no-op
          // without `at`, i.e. for the plain-text stream.
          closeThinking({ ...m, content: m.content + action.delta }, action.at),
        ),
      };
    }

    case "THINKING": {
      // P6.3a. Same in-flight guard and lazy draft as CHUNK. The draft starts
      // with EMPTY content: the answer has not begun, the reasoning is all there is.
      // Reasoning that resumes after the answer started (the model switched
      // blocks) is appended to the same trace; its timestamps are not reopened.
      if (state.status !== "sending" && state.status !== "streaming") return state;
      const exists = state.messages.some((m) => m.id === action.id);
      if (!exists) {
        const draft: ChatMessage = {
          id: action.id,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          isPartial: false,
          thinking: { text: action.delta, startedAt: action.at },
        };
        return { ...state, status: "streaming", statusCode: null, messages: [...state.messages, draft] };
      }
      return {
        ...state,
        status: "streaming",
        statusCode: null,
        messages: replaceMessage(state.messages, action.id, (m) => ({
          ...m,
          thinking: m.thinking
            ? { ...m.thinking, text: m.thinking.text + action.delta }
            : { text: action.delta, startedAt: action.at },
        })),
      };
    }

    case "STATUS": {
      // P6.3a. The server sends this once, before any content. Only accepted
      // in the gap before the assistant's draft exists; after that it is stale.
      if (state.status !== "sending") return state;
      return { ...state, statusCode: action.code };
    }

    case "DONE": {
      if (state.status !== "sending" && state.status !== "streaming") return state;
      return {
        ...state,
        status: "done",
        statusCode: null,
        messages: replaceMessage(state.messages, action.id, (m) => closeThinking(m, action.at)),
      };
    }

    case "STOP": {
      if (state.status !== "sending" && state.status !== "streaming") return state;
      const hasContent = state.messages.some((m) => m.id === action.id && hasAnything(m));
      return {
        ...state,
        status: "stopped",
        statusCode: null,
        // Nothing streamed yet when Stop landed — drop the empty draft
        // rather than leaving a blank assistant bubble in the
        // transcript. Otherwise mark it partial: the server-side
        // contract (Phase 4's "chat contract" note) persists whatever
        // was received with isPartial: true and bills for it, so the
        // client's own view must match what actually got saved/billed.
        messages: hasContent
          ? replaceMessage(state.messages, action.id, (m) => closeThinking({ ...m, isPartial: true }, action.at))
          : state.messages.filter((m) => m.id !== action.id),
      };
    }

    case "PARTIAL": {
      if (state.status !== "sending" && state.status !== "streaming") return state;
      const hasContent = state.messages.some((m) => m.id === action.id && hasAnything(m));
      return {
        ...state,
        status: "partial",
        statusCode: null,
        messages: hasContent
          ? replaceMessage(state.messages, action.id, (m) => closeThinking({ ...m, isPartial: true }, action.at))
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
        statusCode: null,
        error: action.error,
        messages: state.messages.filter((m) => !(m.id === action.id && m.content.length === 0)),
      };
    }

    case "RESET_ERROR": {
      if (state.status !== "error") return state;
      return { ...state, status: "idle", error: null };
    }

    // P6.3e (session 53). The session was seeded from the on-device cache (or from nothing) and the
    // server's real history has just arrived. Adopt it ONLY while this session has not sent anything
    // ("idle" and no error): once a turn has started, `state.messages` is the live truth and a
    // fetch that began before that turn (a brand-new chat's fetch returns "no messages yet") must never
    // overwrite it. An empty answer never replaces anything. An identical list returns the same state
    // object, so a no-change reload causes no re-render.
    case "HISTORY_LOADED": {
      if (state.status !== "idle" || state.error !== null) return state;
      if (action.messages.length === 0) return state;
      if (sameMessages(state.messages, action.messages)) return state;
      return { ...state, messages: action.messages };
    }

    default:
      return state;
  }
}
