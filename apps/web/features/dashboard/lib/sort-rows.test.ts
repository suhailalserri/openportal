import { describe, it, expect } from "vitest";

import { sortModelRows, nextModelSort, DEFAULT_MODEL_SORT } from "./sort-rows";
import type { UsageByModelRow } from "../types";

const rows: UsageByModelRow[] = [
  { modelId: "gpt-4o", requestCount: 10, inputTokens: 1000, outputTokens: 500, spentMicroCredits: 5_000_000 },
  { modelId: "claude-opus", requestCount: 25, inputTokens: 200, outputTokens: 200, spentMicroCredits: 9_000_000 },
  { modelId: "deepseek-r2", requestCount: 3, inputTokens: 4000, outputTokens: 4000, spentMicroCredits: 1_000_000 },
] as UsageByModelRow[];

describe("sortModelRows", () => {
  it("does not mutate the input array", () => {
    const copy = [...rows];
    sortModelRows(rows, "spent", "asc");
    expect(rows).toEqual(copy);
  });

  it("sorts by spend, descending (the table's original default)", () => {
    const sorted = sortModelRows(rows, "spent", "desc");
    expect(sorted.map((r) => r.modelId)).toEqual(["claude-opus", "gpt-4o", "deepseek-r2"]);
  });

  it("sorts by spend, ascending", () => {
    const sorted = sortModelRows(rows, "spent", "asc");
    expect(sorted.map((r) => r.modelId)).toEqual(["deepseek-r2", "gpt-4o", "claude-opus"]);
  });

  it("sorts by requests", () => {
    const sorted = sortModelRows(rows, "requests", "desc");
    expect(sorted.map((r) => r.modelId)).toEqual(["claude-opus", "gpt-4o", "deepseek-r2"]);
  });

  it("sorts by tokens as the input+output sum", () => {
    // deepseek-r2: 8000, gpt-4o: 1500, claude-opus: 400
    const sorted = sortModelRows(rows, "tokens", "desc");
    expect(sorted.map((r) => r.modelId)).toEqual(["deepseek-r2", "gpt-4o", "claude-opus"]);
  });

  it("sorts by model id alphabetically", () => {
    const sorted = sortModelRows(rows, "model", "asc");
    expect(sorted.map((r) => r.modelId)).toEqual(["claude-opus", "deepseek-r2", "gpt-4o"]);
  });

  it("returns a new array even when there's nothing to reorder", () => {
    const single = [rows[0]!];
    const sorted = sortModelRows(single, "spent", "asc");
    expect(sorted).not.toBe(single);
    expect(sorted).toEqual(single);
  });
});

describe("nextModelSort", () => {
  it("toggles direction when the same column is clicked again", () => {
    const first = nextModelSort(DEFAULT_MODEL_SORT, "spent");
    expect(first).toEqual({ key: "spent", direction: "asc" });
    const second = nextModelSort(first, "spent");
    expect(second).toEqual({ key: "spent", direction: "desc" });
  });

  it("defaults a newly-clicked numeric column to descending", () => {
    expect(nextModelSort(DEFAULT_MODEL_SORT, "tokens")).toEqual({ key: "tokens", direction: "desc" });
    expect(nextModelSort(DEFAULT_MODEL_SORT, "requests")).toEqual({ key: "requests", direction: "desc" });
  });

  it("defaults a newly-clicked model column to ascending", () => {
    expect(nextModelSort(DEFAULT_MODEL_SORT, "model")).toEqual({ key: "model", direction: "asc" });
  });
});
