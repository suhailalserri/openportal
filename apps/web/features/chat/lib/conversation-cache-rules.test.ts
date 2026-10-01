import { describe, it, expect } from "vitest";

import { isUsableCachedMessages, shouldCacheMessages } from "./conversation-cache";
import type { ChatMessage } from "../types";

/**
 * Session 53. The cache must never turn "no messages known yet" into a hit: a brand-new chat's first
 * history fetch answers 404-as-empty, and caching that made the chat open empty on the next visit.
 */
const msg: ChatMessage = {
  id: "m1",
  role: "user",
  content: "hi",
  createdAt: "2026-01-01T00:00:00.000Z",
  isPartial: false,
};

describe("conversation cache rules", () => {
  it("an empty cached list is not a hit", () => {
    expect(isUsableCachedMessages([])).toBe(false);
  });
  it("a missing cache entry is not a hit", () => {
    expect(isUsableCachedMessages(undefined)).toBe(false);
  });
  it("a non-array value (corrupt entry) is not a hit", () => {
    expect(isUsableCachedMessages({} as unknown as ChatMessage[])).toBe(false);
  });
  it("a non-empty cached list is a hit", () => {
    expect(isUsableCachedMessages([msg])).toBe(true);
  });
  it("an empty server answer is never written to the cache", () => {
    expect(shouldCacheMessages([])).toBe(false);
  });
  it("a non-empty server answer is written", () => {
    expect(shouldCacheMessages([msg])).toBe(true);
  });
});
