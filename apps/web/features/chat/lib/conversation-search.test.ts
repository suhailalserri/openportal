import { describe, expect, it } from "vitest";

import { filterConversationsByQuery } from "./conversation-search";
import type { ConversationSummary } from "../types";

function conv(overrides: Partial<ConversationSummary> & { id: string }): ConversationSummary {
  return {
    id: overrides.id,
    title: overrides.title ?? null,
    modelId: overrides.modelId ?? null,
    isPinned: overrides.isPinned ?? false,
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("filterConversationsByQuery", () => {
  it("returns everything, untouched, for an empty query", () => {
    const list = [conv({ id: "a", title: "Trip planning" }), conv({ id: "b", title: null })];
    expect(filterConversationsByQuery(list, "")).toEqual(list);
  });

  it("returns everything for a whitespace-only query", () => {
    const list = [conv({ id: "a", title: "Trip planning" })];
    expect(filterConversationsByQuery(list, "   ")).toEqual(list);
  });

  it("matches case-insensitively, as a substring", () => {
    const list = [
      conv({ id: "a", title: "Trip Planning" }),
      conv({ id: "b", title: "Recipe ideas" }),
    ];
    expect(filterConversationsByQuery(list, "trip").map((c) => c.id)).toEqual(["a"]);
    expect(filterConversationsByQuery(list, "PLAN").map((c) => c.id)).toEqual(["a"]);
  });

  it("never matches a null title against a non-empty query", () => {
    const list = [conv({ id: "a", title: null })];
    expect(filterConversationsByQuery(list, "anything")).toEqual([]);
  });

  it("does not match against modelId", () => {
    const list = [conv({ id: "a", title: "Weekend plans", modelId: "gpt-4o" })];
    expect(filterConversationsByQuery(list, "4o")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const list = [conv({ id: "a", title: "Trip planning" })];
    const result = filterConversationsByQuery(list, "trip");
    expect(result).not.toBe(list);
  });
});
