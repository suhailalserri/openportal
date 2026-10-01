import { describe, it, expect } from "vitest";

import { nextHistory } from "./history-estimate";
import type { ChatMessage } from "../types";

const m = (id: string, content: string): ChatMessage => ({
  id,
  role: "user",
  content,
  createdAt: "2026-01-01T00:00:00.000Z",
  isPartial: false,
});

describe("nextHistory (P6.3f)", () => {
  it("builds { content } entries on the first call, even when frozen", () => {
    const msgs = [m("1", "a"), m("2", "b")];
    expect(nextHistory(msgs, null, false).value).toEqual([{ content: "a" }, { content: "b" }]);
    expect(nextHistory(msgs, null, true).value).toEqual([{ content: "a" }, { content: "b" }]);
  });

  it("returns the SAME object while the messages list is the same (keystrokes)", () => {
    const msgs = [m("1", "a")];
    const first = nextHistory(msgs, null, false);
    expect(nextHistory(msgs, first, false)).toBe(first);
  });

  it("recomputes when the list changes and nothing is in flight", () => {
    const first = nextHistory([m("1", "a")], null, false);
    const next = nextHistory([m("1", "a"), m("2", "b")], first, false);
    expect(next).not.toBe(first);
    expect(next.value).toHaveLength(2);
  });

  it("keeps the previous object while a reply is in flight, even if the list changed", () => {
    const first = nextHistory([m("1", "a")], null, false);
    expect(nextHistory([m("1", "a"), m("2", "partial")], first, true)).toBe(first);
  });

  it("picks up the final text as soon as the turn ends", () => {
    const first = nextHistory([m("1", "a")], null, false);
    const final = [m("1", "a"), m("2", "the whole answer")];
    expect(nextHistory(final, first, true)).toBe(first);
    expect(nextHistory(final, first, false).value[1]).toEqual({ content: "the whole answer" });
  });
});
