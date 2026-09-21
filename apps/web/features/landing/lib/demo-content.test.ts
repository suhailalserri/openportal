import { describe, it, expect } from "vitest";

import { parseDemoContent } from "./demo-content";

const validVariant = {
  prompt: "Hello?",
  reply: "Hi there.",
  inputTokens: 3,
  outputTokens: 4,
  costYer: 0.5,
};

const validScenario = {
  id: "gpt",
  modelName: "GPT-4o",
  modelBadge: "Fast",
  en: validVariant,
  ar: validVariant,
};

describe("parseDemoContent", () => {
  it("returns null for non-object input", () => {
    expect(parseDemoContent(null)).toBeNull();
    expect(parseDemoContent("nope")).toBeNull();
    expect(parseDemoContent([1, 2, 3])).toBeNull();
  });

  it("returns null when enabled is explicitly false", () => {
    expect(parseDemoContent({ enabled: false, scenarios: [validScenario] })).toBeNull();
  });

  it("parses a valid multi-scenario file", () => {
    const result = parseDemoContent({
      enabled: true,
      simulated: true,
      scenarios: [validScenario, { ...validScenario, id: "claude", modelName: "Claude" }],
    });
    expect(result).not.toBeNull();
    expect(result!.scenarios).toHaveLength(2);
    expect(result!.scenarios[0]!.modelName).toBe("GPT-4o");
    expect(result!.scenarios[1]!.modelName).toBe("Claude");
  });

  it("drops a malformed scenario but keeps the valid ones (partial failure is not fatal)", () => {
    const result = parseDemoContent({
      scenarios: [validScenario, { modelName: "", en: validVariant, ar: validVariant }, { garbage: true }],
    });
    expect(result).not.toBeNull();
    expect(result!.scenarios).toHaveLength(1);
    expect(result!.scenarios[0]!.modelName).toBe("GPT-4o");
  });

  it("returns null when every scenario fails to parse", () => {
    expect(parseDemoContent({ scenarios: [{ garbage: true }, {}] })).toBeNull();
  });

  it("supports the old single-scenario shape (top-level en/ar, no scenarios array)", () => {
    const result = parseDemoContent({ enabled: true, simulated: true, en: validVariant, ar: validVariant });
    expect(result).not.toBeNull();
    expect(result!.scenarios).toHaveLength(1);
    expect(result!.scenarios[0]!.en).toEqual(validVariant);
    expect(result!.scenarios[0]!.modelName).toBe("AI");
  });

  it("treats a missing simulated flag as simulated=true (never silently presents invented numbers as real)", () => {
    const result = parseDemoContent({ scenarios: [validScenario] });
    expect(result!.simulated).toBe(true);
  });

  it("only simulated:false (explicit) turns the badge off", () => {
    const result = parseDemoContent({ simulated: false, scenarios: [validScenario] });
    expect(result!.simulated).toBe(false);
  });

  it("rejects a variant with empty prompt/reply, negative tokens, or negative cost", () => {
    const bad = (patch: Partial<typeof validVariant>) =>
      parseDemoContent({ scenarios: [{ ...validScenario, en: { ...validVariant, ...patch } }] });

    expect(bad({ prompt: "" })).toBeNull();
    expect(bad({ reply: "   " })).toBeNull();
    expect(bad({ inputTokens: -1 })).toBeNull();
    expect(bad({ outputTokens: Number.NaN })).toBeNull();
    expect(bad({ costYer: -0.01 })).toBeNull();
  });

  it("rejects a scenario with an empty modelName", () => {
    expect(
      parseDemoContent({ scenarios: [{ ...validScenario, modelName: "" }] }),
    ).toBeNull();
  });

  it("modelBadge is optional but must be a string when present", () => {
    const noBadge = parseDemoContent({ scenarios: [{ ...validScenario, modelBadge: undefined }] });
    expect(noBadge!.scenarios[0]!.modelBadge).toBeUndefined();

    const badBadge = parseDemoContent({ scenarios: [{ ...validScenario, modelBadge: 123 }] });
    expect(badBadge).toBeNull();
  });

  it("falls back to a generated id when a scenario's id is missing or blank", () => {
    const result = parseDemoContent({
      scenarios: [{ modelName: "X", en: validVariant, ar: validVariant }],
    });
    expect(result!.scenarios[0]!.id).toBe("scenario-0");
  });
});
