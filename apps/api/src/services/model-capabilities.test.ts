/** P6.5: capability helper. Pure: no db, config or network. */
import { describe, it, expect } from "vitest";
import { modelSupportsTools, modelSupportsReasoning } from "./model-capabilities";

describe("modelSupportsTools", () => {
  it("only with the functionCalling flag", () => {
    expect(modelSupportsTools(["functionCalling"])).toBe(true);
    expect(modelSupportsTools(["vision", "coding", "functionCalling"])).toBe(true);
    expect(modelSupportsTools(["vision", "reasoning", "webSearch"])).toBe(false);
  });
  it("empty, missing or unknown means no", () => {
    expect(modelSupportsTools([])).toBe(false);
    expect(modelSupportsTools(null)).toBe(false);
    expect(modelSupportsTools(undefined)).toBe(false);
    expect(modelSupportsTools(["function_calling", "FunctionCalling", "tools"])).toBe(false);
  });
  it("a speech-to-text model is never allowed, even if flagged", () => {
    expect(modelSupportsTools(["functionCalling", "transcription"])).toBe(false);
  });
});

describe("modelSupportsReasoning", () => {
  it("only with the reasoning flag", () => {
    expect(modelSupportsReasoning(["reasoning"])).toBe(true);
    expect(modelSupportsReasoning(["functionCalling"])).toBe(false);
  });
  it("empty, missing or unknown means no; transcription never", () => {
    expect(modelSupportsReasoning([])).toBe(false);
    expect(modelSupportsReasoning(null)).toBe(false);
    expect(modelSupportsReasoning(["Reasoning"])).toBe(false);
    expect(modelSupportsReasoning(["reasoning", "transcription"])).toBe(false);
  });
  it("the two flags are independent", () => {
    const c = ["reasoning"];
    expect(modelSupportsReasoning(c)).toBe(true);
    expect(modelSupportsTools(c)).toBe(false);
  });
});
