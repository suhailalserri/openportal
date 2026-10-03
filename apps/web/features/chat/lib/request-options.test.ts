import { describe, it, expect } from "vitest";

import { DEFAULT_CONVERSATION_PARAMS } from "../types";
import {
  WEB_SEARCH_CONTROL_ENABLED,
  modelOffersReasoning,
  paramsAfterModelChange,
  requestOptionFields,
} from "./request-options";

describe("modelOffersReasoning", () => {
  it("is true only for the admin `reasoning` flag", () => {
    expect(modelOffersReasoning(["vision", "reasoning"])).toBe(true);
    expect(modelOffersReasoning(["vision"])).toBe(false);
    expect(modelOffersReasoning([])).toBe(false);
    expect(modelOffersReasoning(null)).toBe(false);
    expect(modelOffersReasoning(undefined)).toBe(false);
  });
  it("never for a speech-to-text model", () => {
    expect(modelOffersReasoning(["transcription", "reasoning"])).toBe(false);
  });
});

describe("requestOptionFields", () => {
  it("sends nothing for model default", () => {
    expect(requestOptionFields(DEFAULT_CONVERSATION_PARAMS)).toEqual({});
    expect(requestOptionFields(undefined)).toEqual({});
  });
  it("sends the chosen effort and never a null", () => {
    expect(requestOptionFields({ reasoningEffort: "high", webSearch: false })).toEqual({ reasoningEffort: "high" });
  });
  it("does not send webSearch while the control is hidden, even if a stored value says true", () => {
    expect(WEB_SEARCH_CONTROL_ENABLED).toBe(false);
    expect(requestOptionFields({ reasoningEffort: null, webSearch: true })).toEqual({});
  });
});

describe("paramsAfterModelChange", () => {
  it("returns the effort to model default and keeps the other params", () => {
    const next = paramsAfterModelChange({ ...DEFAULT_CONVERSATION_PARAMS, temperature: 0.3, reasoningEffort: "low" });
    expect(next.reasoningEffort).toBeNull();
    expect(next.temperature).toBe(0.3);
  });
  it("returns the same object when there is nothing to reset", () => {
    expect(paramsAfterModelChange(DEFAULT_CONVERSATION_PARAMS)).toBe(DEFAULT_CONVERSATION_PARAMS);
  });
});
