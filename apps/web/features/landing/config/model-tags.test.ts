import { describe, it, expect } from "vitest";

import {
  CURATED_TAGS,
  LONG_CONTEXT_TOKENS,
  MAX_TAGS,
  MODEL_TAGS,
  PATTERN_RULES,
  tagsForModel,
  type ModelTag,
} from "./model-tags";

const m = (id: string, extra: { supportsVision?: boolean; contextWindow?: number } = {}) => ({
  id,
  supportsVision: extra.supportsVision ?? false,
  contextWindow: extra.contextWindow ?? 8_192,
});

describe("tagsForModel — curated entries win", () => {
  it("returns the curated list for an exact id", () => {
    expect(tagsForModel(m("deepseek-r2"))).toEqual(["reasoning", "math", "coding"]);
  });
  it("does not ALSO apply pattern rules to a curated id", () => {
    // "gpt-4o-mini" would match the `mini` -> fast rule; the curated list is authoritative.
    expect(tagsForModel(m("gpt-4o-mini"))).toEqual(["fast", "general"]);
  });
});

describe("tagsForModel — pattern fallback matches whole delimiter-separated tokens", () => {
  it("'mini' matches gpt-5-mini", () => {
    expect(tagsForModel(m("gpt-5-mini"))).toContain("fast");
  });
  it("'mini' does NOT match inside 'gemini' (the documented trap)", () => {
    const tags = tagsForModel(m("gemini-3-ultra"));
    expect(tags).not.toContain("fast");
  });
  it("'pro' does not match inside 'professional' or 'prompt'", () => {
    expect(tagsForModel(m("professional-writer"))).toEqual(["general"]);
    expect(tagsForModel(m("prompt-tuned"))).toEqual(["general"]);
  });
  it("matches across the OpenRouter-style separators / : _ .", () => {
    expect(tagsForModel(m("nex-agi/nex-n2.5-pro:free"))).toContain("reasoning");
    expect(tagsForModel(m("acme/coder_v2"))).toContain("coding");
    expect(tagsForModel(m("acme/model.thinking"))).toContain("reasoning");
    expect(tagsForModel(m("meta/llama-3-flash:free"))).toContain("fast");
  });
  it("is case-insensitive", () => {
    expect(tagsForModel(m("Acme-CODER-1"))).toContain("coding");
  });
  it("token at the very start and very end of the id", () => {
    expect(tagsForModel(m("coder"))).toContain("coding");
    expect(tagsForModel(m("x-y-coder"))).toContain("coding");
    expect(tagsForModel(m("mini-x"))).toContain("fast");
  });
});

describe("tagsForModel — data-derived tags", () => {
  it("adds 'vision' when the model supports it", () => {
    expect(tagsForModel(m("acme-x", { supportsVision: true }))).toContain("vision");
  });
  it("adds 'longContext' at and above the threshold, not below", () => {
    expect(tagsForModel(m("acme-x", { contextWindow: LONG_CONTEXT_TOKENS }))).toContain("longContext");
    expect(tagsForModel(m("acme-x", { contextWindow: LONG_CONTEXT_TOKENS - 1 }))).not.toContain(
      "longContext",
    );
  });
});

describe("tagsForModel — shape guarantees", () => {
  it("falls back to ['general'] when nothing applies", () => {
    expect(tagsForModel(m("totally-unknown-model"))).toEqual(["general"]);
  });
  it("never returns more than MAX_TAGS", () => {
    const tags = tagsForModel(
      m("acme/coder-reasoner-mini-pro", { supportsVision: true, contextWindow: 1_000_000 }),
    );
    expect(tags.length).toBeLessThanOrEqual(MAX_TAGS);
  });
  it("never returns duplicates", () => {
    const tags = tagsForModel(m("acme/coder-code-codestral", { supportsVision: true }));
    expect(new Set(tags).size).toBe(tags.length);
  });
  it("never returns an empty list", () => {
    for (const id of ["", "-", "/", "a", "gpt-4o", "??"]) {
      expect(tagsForModel(m(id)).length).toBeGreaterThan(0);
    }
  });
  it("only ever returns known tags", () => {
    const known = new Set<ModelTag>(MODEL_TAGS);
    for (const id of ["gpt-4o", "acme-pro", "x-coder", "y-mini", "z-thinking", "unknown"]) {
      for (const t of tagsForModel(m(id, { supportsVision: true, contextWindow: 999_999 }))) {
        expect(known.has(t)).toBe(true);
      }
    }
  });
});

describe("config integrity", () => {
  it("every curated tag is a known tag", () => {
    const known = new Set<string>(MODEL_TAGS);
    for (const tags of Object.values(CURATED_TAGS)) {
      for (const t of tags) expect(known.has(t)).toBe(true);
    }
  });
  it("every pattern rule only emits known tags", () => {
    const known = new Set<string>(MODEL_TAGS);
    for (const rule of PATTERN_RULES) {
      for (const t of rule.tags) expect(known.has(t)).toBe(true);
    }
  });
  it("every curated entry fits within MAX_TAGS", () => {
    for (const tags of Object.values(CURATED_TAGS)) {
      expect(tags.length).toBeLessThanOrEqual(MAX_TAGS);
    }
  });
  it("MODEL_TAGS has no duplicates", () => {
    expect(new Set(MODEL_TAGS).size).toBe(MODEL_TAGS.length);
  });
});
