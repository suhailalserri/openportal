import { describe, it, expect, vi, afterEach } from "vitest";

import { generateConversationId, conversationPath } from "./new-chat";

describe("generateConversationId", () => {
  afterEach(() => {
    // `vi.restoreAllMocks()` only undoes `vi.spyOn`/`vi.fn` mocks — it does
    // NOT touch `vi.stubGlobal` (two of the four tests below stub
    // `globalThis.crypto`). Without `unstubAllGlobals()` here, a stubbed
    // fake `crypto` leaks into the next test in this file, which is
    // exactly what happened in CI: "produces distinct ids across calls"
    // got the SAME fixed id twice because the previous test's stub was
    // still active. Both calls are kept — restoreAllMocks for any future
    // spy-based test added to this suite, unstubAllGlobals for the
    // globals this file actually stubs today.
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses crypto.randomUUID when available", () => {
    const fixed = "11111111-2222-4333-8444-555555555555";
    vi.stubGlobal("crypto", { randomUUID: () => fixed });
    expect(generateConversationId()).toBe(fixed);
  });

  it("produces distinct ids across calls (real crypto, no stub)", () => {
    const a = generateConversationId();
    const b = generateConversationId();
    expect(a).not.toBe(b);
  });

  it("produces a UUID-v4-shaped string", () => {
    const id = generateConversationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("falls back to a manually generated id when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {}); // no randomUUID key at all
    const id = generateConversationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe("conversationPath", () => {
  it("builds a locale-prefixed /chat/[id] path", () => {
    expect(conversationPath("ar", "abc-123")).toBe("/ar/chat/abc-123");
    expect(conversationPath("en", "abc-123")).toBe("/en/chat/abc-123");
  });
});
