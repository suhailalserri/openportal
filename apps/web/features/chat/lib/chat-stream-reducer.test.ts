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
    };
    const reset = chatStreamReducer(errored, { type: "RESET_ERROR" });
    expect(reset.status).toBe("idle");
    expect(reset.error).toBeNull();

    // No-op from any other status.
    const idleAttempt = chatStreamReducer(initialChatStreamState, { type: "RESET_ERROR" });
    expect(idleAttempt).toBe(initialChatStreamState);
  });
});
