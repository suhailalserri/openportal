import { describe, it, expect } from "vitest";

import {
  resolveCategoryScore,
  rankModelsForCategory,
  categoryHasCoverage,
  availableCategoryTabs,
} from "./model-ranking";
import type { ChatModel } from "./model-selection";

function model(id: string, categoryScores?: Record<string, number>): ChatModel {
  return {
    id,
    displayName: id.toUpperCase(),
    displayNameAr: `ar-${id}`,
    badge: "",
    provider: "openai",
    tier: "standard",
    contextWindow: 128_000,
    maxOutputTokens: 8192,
    supportsVision: false,
    avgResponseTimeMs: null,
    creditsPerKInput: 1,
    creditsPerKOutput: 3,
    ...(categoryScores ? { categoryScores } : {}),
  };
}

describe("resolveCategoryScore", () => {
  it("uses the direct score when one is set for the category", () => {
    const m = model("a", { coding: 90, overall: 80 });
    expect(resolveCategoryScore(m, "coding")).toBe(90);
  });

  it("falls back to the mean of other scores when the category is unset", () => {
    const m = model("a", { reasoning: 80, mathematics: 90 });
    expect(resolveCategoryScore(m, "coding")).toBe(85);
  });

  it("returns undefined when the model has no scores at all", () => {
    expect(resolveCategoryScore(model("a"), "coding")).toBeUndefined();
  });

  it("does NOT fall back off a single lonely score (regression: a model scored only in Mathematics must not rank in Reasoning/Coding/etc.)", () => {
    const m = model("a", { mathematics: 66 });
    expect(resolveCategoryScore(m, "reasoning")).toBeUndefined();
    expect(resolveCategoryScore(m, "coding")).toBeUndefined();
    expect(resolveCategoryScore(m, "overall")).toBeUndefined();
    // the category it actually has a score for still works
    expect(resolveCategoryScore(m, "mathematics")).toBe(66);
  });

  it("overall falls back to the mean of other categories when unset", () => {
    const m = model("a", { reasoning: 100, coding: 50 });
    expect(resolveCategoryScore(m, "overall")).toBe(75);
  });
});

describe("rankModelsForCategory", () => {
  it("sorts by the category's own score, best first — not by overall", () => {
    const strong_overall = model("strong-overall", { overall: 90, coding: 70 });
    const strong_coding = model("strong-coding", { overall: 80, coding: 95 });
    const ranked = rankModelsForCategory([strong_overall, strong_coding], "coding");
    expect(ranked.map((m) => m.id)).toEqual(["strong-coding", "strong-overall"]);
  });

  it("pushes fully-unscored models to the end without crashing", () => {
    const scored = model("scored", { coding: 50 });
    const unscored = model("unscored");
    const ranked = rankModelsForCategory([unscored, scored], "coding");
    expect(ranked.map((m) => m.id)).toEqual(["scored", "unscored"]);
  });

  it("keeps stable insertion order among ties", () => {
    const a = model("a", { coding: 80 });
    const b = model("b", { coding: 80 });
    expect(rankModelsForCategory([a, b], "coding").map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("categoryHasCoverage / availableCategoryTabs", () => {
  it("reports coverage true only when at least one model resolves a score", () => {
    expect(categoryHasCoverage([model("a", { coding: 1 })], "coding")).toBe(true);
    expect(categoryHasCoverage([model("a")], "coding")).toBe(false);
  });

  it("always includes overall, and only ranked categories with coverage", () => {
    const models = [model("a", { coding: 90 })];
    expect(availableCategoryTabs(models)).toEqual(["overall", "coding"]);
  });

  it("returns only overall when nothing is scored yet", () => {
    expect(availableCategoryTabs([model("a")])).toEqual(["overall"]);
  });
});
