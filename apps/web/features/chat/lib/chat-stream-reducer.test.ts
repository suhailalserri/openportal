import { describe, it, expect } from "vitest";

import {
  chatStreamReducer,
  initialChatStreamState,
  type ChatStreamState,
} from "./chat-stream-reducer";
import type { ChatMessage } from "../types";

/**
 * apps/web/features/chat/lib/chat-stream-reducer.test.ts
 *
 * Phase 4b. Pure state-machine tests — no fetch, no timers, no DOM.
 * Covers the plan's 5 required behaviors that concern STATE (the other
 * 3 — chunk ordering, the Arabic split-character decode, and the
 * network-drop → partial path — are stream-reader.test.ts's job, since
 * they're about the read/decode loop, not the reducer).
 */

function userMessage(content: string): ChatMessage {
  return {
    id: "user-1",
    role: "user",
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
    isPartial: false,
  };
}

describe("chatStreamReducer — happy path", () => {
  it("SEND then CHUNK then DONE builds the assistant message incrementally", () => {
    let state: ChatStreamState = initialChatStreamState;

    state = chatStreamReducer(state, {
      type: "SEND",
      userMessage: userMessage("hi"),
      assistantMessageId: "a1",
    });
    expect(state.status).toBe("sending");
    expect(state.messages).toHaveLength(1);

    state = chatStreamReducer(state, { type: "CHUNK", id: "a1", delta: "Hel" });
    expect(state.status).toBe("streaming");
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]?.content).toBe("Hel");

    state = chatStreamReducer(state, { type: "CHUNK", id: "a1", delta: "lo" });
    expect(state.messages[1]?.content).toBe("Hello");

    state = chatStreamReducer(state, { type: "DONE", id: "a1" });
    expect(state.status).toBe("done");
    // DONE doesn't touch message content/isPartial — the assistant
    // message stays exactly what streamed in.
    expect(state.messages[1]?.content).toBe("Hello");
    expect(state.messages[1]?.isPartial).toBe(false);
  });
});

describe("chatStreamReducer — send-lock", () => {
  it("ignores a second SEND while status is 'sending'", () => {
    const sending = chatStreamReducer(initialChatStreamState, {
      type: "SEND",
      userMessage: userMessage("first"),
      assistantMessageId: "a1",
    });
    expect(sending.status).toBe("sending");

    const afterSecondSend = chatStreamReducer(sending, {
      type: "SEND",
      userMessage: userMessage("second, while first is still in flight"),
      assistantMessageId: "a2",
    });

    // Unchanged: same single user message, still "sending".
    expect(afterSecondSend).toBe(sending);
    expect(afterSecondSend.messages).toHaveLength(1);
  });

  it("ignores a second SEND while status is 'streaming'", () => {
    let state = chatStreamReducer(initialChatStreamState, {
      type: "SEND",
      userMessage: userMessage("first"),
      assistantMessageId: "a1",
    });
    state = chatStreamReducer(state, { type: "CHUNK", id: "a1", delta: "partial answer" });
    expect(state.status).toBe("streaming");

    const afterSecondSend = chatStreamReducer(state, {
      type: "SEND",
      userMessage: userMessage("second"),
      assistantMessageId: "a2",
    });

    expect(afterSecondSend).toBe(state);
    expect(afterSecondSend.messages).toHaveLength(2); // user-1 + a1 only
  });
});

describe("chatStreamReducer — Stop", () => {
  it("marks a stream with content as stopped + isPartial, and accepts no further updates for it", () => {
    let state = chatStreamReducer(initialChatStreamState, {
      type: "SEND",
      userMessage: userMessage("hi"),
      assistantMessageId: "a1",
    });
    state = chatStreamReducer(state, { type: "CHUNK", id: "a1", delta: "Some partial" });

    state = chatStreamReducer(state, { type: "STOP", id: "a1" });
    expect(state.status).toBe("stopped");
    expect(state.messages[1]?.content).toBe("Some partial");
    expect(state.messages[1]?.isPartial).toBe(true);

    // A stray CHUNK for the same id arrives late (the old read() promise
    // resolving after abort was already requested) — must be a no-op.
    const afterStrayChunk = chatStreamReducer(state, {
      type: "CHUNK",
      id: "a1",
      delta: " MORE TEXT THAT SHOULD NEVER APPEAR",
    });
    expect(afterStrayChunk).toBe(state);
    expect(afterStrayChunk.messages[1]?.content).toBe("Some partial");

    // A stray DONE for the same id is equally a no-op.
    const afterStrayDone = chatStreamReducer(state, { type: "DONE", id: "a1" });
    expect(afterStrayDone).toBe(state);
    expect(afterStrayDone.status).toBe("stopped");
  });

  it("drops the assistant draft entirely if Stop lands before any content arrived", () => {
    const state = chatStreamReducer(initialChatStreamState, {
      type: "SEND",
      userMessage: userMessage("hi"),
      assistantMessageId: "a1",
    });
    const stopped = chatStreamReducer(state, { type: "STOP", id: "a1" });
    expect(stopped.status).toBe("stopped");
    expect(stopped.messages).toHaveLength(1); // just the user turn
  });
});

describe("chatStreamReducer — Error", () => {
  it("removes the empty assistant draft on an error with no content yet", () => {
    const state = chatStreamReducer(initialChatStreamState, {
      type: "SEND",
      userMessage: userMessage("hi"),
      assistantMessageId: "a1",
    });
    const errored = chatStreamReducer(state, {
      type: "ERROR",
      id: "a1",
      error: { id: "err-1", message: "رصيدك صفر", retryable: false },
    });
    expect(errored.status).toBe("error");
    expect(errored.error?.message).toBe("رصيدك صفر");
    expect(errored.messages).toHaveLength(1); // draft removed, user turn kept
  });

  it("passes redirectTo through untouched (401 mid-stream case)", () => {
    // Regression guard: use-chat-stream.ts must forward stream-reader.ts's
    // redirectTo into the dispatched ChatError, and the reducer must not
    // drop it when building state.error — the caller (not built until a
    // later phase) is what actually performs the sanitized redirect.
    const state = chatStreamReducer(initialChatStreamState, {
      type: "SEND",
      userMessage: userMessage("hi"),
      assistantMessageId: "a1",
    });
    const errored = chatStreamReducer(state, {
      type: "ERROR",
      id: "a1",
      error: { id: "err-1", message: "unauthorized", retryable: false, redirectTo: "/auth/login" },
    });
    expect(errored.error?.redirectTo).toBe("/auth/login");
  });

  it("RESET_ERROR clears the error and returns to idle, only from 'error'", () => {
    const errored: ChatStreamState = {
      status: "error",
      messages: [userMessage("hi")],
      error: { id: "err-1", message: "oops", retryable: true },
      statusCode: null, // P6.3a: new required field of ChatStreamState
    };
    const reset = chatStreamReducer(errored, { type: "RESET_ERROR" });
    expect(reset.status).toBe("idle");
    expect(reset.error).toBeNull();

    // No-op from any other status.
    const idleAttempt = chatStreamReducer(initialChatStreamState, { type: "RESET_ERROR" });
    expect(idleAttempt).toBe(initialChatStreamState);
  });
});

/* ─────────────────────────────────────────────────────────────────────
 * P6.3a — thinking and status. The actions above are unchanged; these
 * pin what the structured stream adds on top of them.
 * ───────────────────────────────────────────────────────────────────── */

function sent(): ChatStreamState {
  return chatStreamReducer(initialChatStreamState, {
    type: "SEND",
    userMessage: userMessage("hi"),
    assistantMessageId: "a1",
  });
}
const assistant = (s: ChatStreamState) => s.messages.find((m) => m.id === "a1");

describe("chatStreamReducer — THINKING (P6.3a)", () => {
  it("creates the assistant draft with EMPTY content and the reasoning in its own field", () => {
    const s = chatStreamReducer(sent(), { type: "THINKING", id: "a1", delta: "hmm", at: 1000 });
    expect(s.status).toBe("streaming");
    expect(assistant(s)?.content).toBe("");
    expect(assistant(s)?.thinking).toEqual({ text: "hmm", startedAt: 1000 });
  });

  it("appends further reasoning to the same trace and keeps the first start time", () => {
    let s = chatStreamReducer(sent(), { type: "THINKING", id: "a1", delta: "a", at: 1000 });
    s = chatStreamReducer(s, { type: "THINKING", id: "a1", delta: "b", at: 2500 });
    expect(assistant(s)?.thinking).toEqual({ text: "ab", startedAt: 1000 });
    expect(assistant(s)?.content).toBe("");
  });

  it("the first answer text closes the thinking timer and is the only thing that lands in content", () => {
    let s = chatStreamReducer(sent(), { type: "THINKING", id: "a1", delta: "reasoning", at: 1000 });
    s = chatStreamReducer(s, { type: "CHUNK", id: "a1", delta: "Answer", at: 4000 });
    expect(assistant(s)?.content).toBe("Answer");
    expect(assistant(s)?.thinking).toEqual({ text: "reasoning", startedAt: 1000, endedAt: 4000 });
    // a later chunk does not move endedAt
    s = chatStreamReducer(s, { type: "CHUNK", id: "a1", delta: "!", at: 9000 });
    expect(assistant(s)?.thinking?.endedAt).toBe(4000);
  });

  it("CHUNK without `at` (the plain-text stream) never touches thinking and behaves exactly as before", () => {
    const s = chatStreamReducer(sent(), { type: "CHUNK", id: "a1", delta: "plain" });
    expect(assistant(s)).toMatchObject({ content: "plain" });
    expect(assistant(s)?.thinking).toBeUndefined();
  });

  it("is ignored outside an in-flight turn (a late frame from a stopped stream)", () => {
    const stopped = chatStreamReducer(
      chatStreamReducer(sent(), { type: "THINKING", id: "a1", delta: "x", at: 1 }),
      { type: "STOP", id: "a1" },
    );
    expect(chatStreamReducer(stopped, { type: "THINKING", id: "a1", delta: "late", at: 2 })).toBe(stopped);
    expect(chatStreamReducer(initialChatStreamState, { type: "THINKING", id: "a1", delta: "x", at: 1 })).toBe(
      initialChatStreamState,
    );
  });

  it("DONE closes a reasoning-only turn's timer and keeps the message", () => {
    let s = chatStreamReducer(sent(), { type: "THINKING", id: "a1", delta: "only thoughts", at: 1000 });
    s = chatStreamReducer(s, { type: "DONE", id: "a1", at: 6000 });
    expect(s.status).toBe("done");
    expect(assistant(s)?.thinking).toEqual({ text: "only thoughts", startedAt: 1000, endedAt: 6000 });
    expect(assistant(s)?.content).toBe("");
  });
});

describe("chatStreamReducer — stopping or losing a turn that only has reasoning (P6.3a)", () => {
  it("STOP keeps a thinking-only draft, marks it partial and closes the timer", () => {
    let s = chatStreamReducer(sent(), { type: "THINKING", id: "a1", delta: "t", at: 1000 });
    s = chatStreamReducer(s, { type: "STOP", id: "a1", at: 3000 });
    expect(s.status).toBe("stopped");
    expect(assistant(s)).toMatchObject({ isPartial: true, content: "", thinking: { text: "t", startedAt: 1000, endedAt: 3000 } });
  });

  it("PARTIAL keeps a thinking-only draft too", () => {
    let s = chatStreamReducer(sent(), { type: "THINKING", id: "a1", delta: "t", at: 1000 });
    s = chatStreamReducer(s, { type: "PARTIAL", id: "a1", at: 2000 });
    expect(s.status).toBe("partial");
    expect(assistant(s)).toMatchObject({ isPartial: true, thinking: { endedAt: 2000 } });
  });

  it("STOP and PARTIAL still drop a draft that has neither text nor reasoning (unchanged)", () => {
    const empty = chatStreamReducer(sent(), { type: "CHUNK", id: "a1", delta: "" });
    expect(assistant(chatStreamReducer(empty, { type: "STOP", id: "a1" }))).toBeUndefined();
    expect(assistant(chatStreamReducer(empty, { type: "PARTIAL", id: "a1" }))).toBeUndefined();
  });

  it("the old STOP/PARTIAL with answer text still marks it partial, with or without `at`", () => {
    const s = chatStreamReducer(sent(), { type: "CHUNK", id: "a1", delta: "some" });
    expect(assistant(chatStreamReducer(s, { type: "STOP", id: "a1" }))?.isPartial).toBe(true);
    expect(assistant(chatStreamReducer(s, { type: "PARTIAL", id: "a1", at: 5 }))?.isPartial).toBe(true);
  });
});

describe("chatStreamReducer — STATUS (P6.3a)", () => {
  it("is set while waiting for the first output", () => {
    const s = chatStreamReducer(sent(), { type: "STATUS", code: "waiting" });
    expect(s.status).toBe("sending");
    expect(s.statusCode).toBe("waiting");
  });

  it("clears on the first reasoning", () => {
    const s = chatStreamReducer(chatStreamReducer(sent(), { type: "STATUS", code: "waiting" }), {
      type: "THINKING",
      id: "a1",
      delta: "t",
      at: 1,
    });
    expect(s.statusCode).toBeNull();
  });

  it("clears on the first answer text", () => {
    const s = chatStreamReducer(chatStreamReducer(sent(), { type: "STATUS", code: "waiting" }), {
      type: "CHUNK",
      id: "a1",
      delta: "x",
    });
    expect(s.statusCode).toBeNull();
  });

  it("clears when the turn ends any other way, and on a new send", () => {
    const waiting = chatStreamReducer(sent(), { type: "STATUS", code: "waiting" });
    const err = { id: "e", message: "m", retryable: true };
    expect(chatStreamReducer(waiting, { type: "ERROR", id: "a1", error: err }).statusCode).toBeNull();
    expect(chatStreamReducer(waiting, { type: "STOP", id: "a1" }).statusCode).toBeNull();
    expect(chatStreamReducer(waiting, { type: "PARTIAL", id: "a1" }).statusCode).toBeNull();
    expect(chatStreamReducer(waiting, { type: "DONE", id: "a1" }).statusCode).toBeNull();
    const again = chatStreamReducer(chatStreamReducer(waiting, { type: "STOP", id: "a1" }), {
      type: "SEND",
      userMessage: userMessage("again"),
      assistantMessageId: "a2",
    });
    expect(again.statusCode).toBeNull();
  });

  it("is ignored once content has started, and when nothing is in flight", () => {
    const streaming = chatStreamReducer(sent(), { type: "CHUNK", id: "a1", delta: "x" });
    expect(chatStreamReducer(streaming, { type: "STATUS", code: "waiting" })).toBe(streaming);
    expect(chatStreamReducer(initialChatStreamState, { type: "STATUS", code: "waiting" })).toBe(
      initialChatStreamState,
    );
  });

  it("starts as null in the initial state", () => {
    expect(initialChatStreamState.statusCode).toBeNull();
  });
});

describe("chatStreamReducer — edit after a reasoning turn (P6.3a)", () => {
  it("EDIT_SEND drops the old reply together with its reasoning", () => {
    let s = sent();
    s = chatStreamReducer(s, { type: "THINKING", id: "a1", delta: "old thoughts", at: 1 });
    s = chatStreamReducer(s, { type: "CHUNK", id: "a1", delta: "old answer", at: 2 });
    s = chatStreamReducer(s, { type: "DONE", id: "a1", at: 3 });
    const edited = chatStreamReducer(s, {
      type: "EDIT_SEND",
      truncateBeforeId: "user-1",
      userMessage: { ...userMessage("new question"), id: "user-2" },
      assistantMessageId: "a2",
    });
    expect(edited.messages.map((m) => m.id)).toEqual(["user-2"]);
    expect(JSON.stringify(edited)).not.toContain("old thoughts");
  });
});

describe("chatStreamReducer — HISTORY_LOADED (session 53: messages vanished on return)", () => {
  const server = (): ChatMessage[] => [
    userMessage("hello"),
    { id: "a-1", role: "assistant", content: "hi there", createdAt: "2026-01-01T00:00:01.000Z", isPartial: false },
  ];

  it("fills an idle, empty session (the stale-empty-cache case)", () => {
    const next = chatStreamReducer(initialChatStreamState, { type: "HISTORY_LOADED", messages: server() });
    expect(next.messages.map((m) => m.id)).toEqual(["user-1", "a-1"]);
    expect(next.status).toBe("idle");
  });

  it("replaces a stale seeded list with the server's longer one while idle", () => {
    const seeded: ChatStreamState = { ...initialChatStreamState, messages: [userMessage("hello")] };
    const next = chatStreamReducer(seeded, { type: "HISTORY_LOADED", messages: server() });
    expect(next.messages).toHaveLength(2);
  });

  it("returns the SAME state object when nothing changed (no re-render)", () => {
    const seeded: ChatStreamState = { ...initialChatStreamState, messages: server() };
    expect(chatStreamReducer(seeded, { type: "HISTORY_LOADED", messages: server() })).toBe(seeded);
  });

  it("never replaces anything with an empty list", () => {
    const seeded: ChatStreamState = { ...initialChatStreamState, messages: server() };
    expect(chatStreamReducer(seeded, { type: "HISTORY_LOADED", messages: [] })).toBe(seeded);
  });

  it("is ignored while a turn is in flight (sending and streaming)", () => {
    let s = chatStreamReducer(initialChatStreamState, {
      type: "SEND",
      userMessage: userMessage("live question"),
      assistantMessageId: "a1",
    });
    expect(chatStreamReducer(s, { type: "HISTORY_LOADED", messages: server() })).toBe(s);
    s = chatStreamReducer(s, { type: "CHUNK", id: "a1", delta: "partial", at: 1 });
    expect(s.status).toBe("streaming");
    expect(chatStreamReducer(s, { type: "HISTORY_LOADED", messages: server() })).toBe(s);
  });

  it("is ignored after a finished turn: the live conversation is the truth", () => {
    let s = chatStreamReducer(initialChatStreamState, {
      type: "SEND",
      userMessage: userMessage("first message"),
      assistantMessageId: "a1",
    });
    s = chatStreamReducer(s, { type: "CHUNK", id: "a1", delta: "answer", at: 1 });
    s = chatStreamReducer(s, { type: "DONE", id: "a1", at: 2 });
    expect(chatStreamReducer(s, { type: "HISTORY_LOADED", messages: server() })).toBe(s);
  });

  it("is ignored while an error is showing", () => {
    let s = chatStreamReducer(initialChatStreamState, {
      type: "SEND",
      userMessage: userMessage("q"),
      assistantMessageId: "a1",
    });
    s = chatStreamReducer(s, {
      type: "ERROR",
      id: "a1",
      error: { code: "UPSTREAM_ERROR", message: "x" } as never,
    });
    expect(chatStreamReducer(s, { type: "HISTORY_LOADED", messages: server() })).toBe(s);
  });
});
