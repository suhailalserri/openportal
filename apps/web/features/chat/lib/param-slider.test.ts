import { describe, it, expect } from "vitest";

import {
  canStepMaxTokens,
  clampMaxTokens,
  decimalsOf,
  formatSliderValue,
  maxTokensStart,
  maxTokensStep,
  sliderFraction,
  snapToStep,
  stepMaxTokens,
} from "./param-slider";

const TEMP = { min: 0, max: 2, step: 0.1 };
const TOPP = { min: 0, max: 1, step: 0.05 };

describe("decimalsOf", () => {
  it("derives decimals from the step", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.1)).toBe(1);
    expect(decimalsOf(0.05)).toBe(2);
    expect(decimalsOf(0.001)).toBe(3);
    expect(decimalsOf(0)).toBe(0);
  });
});

describe("snapToStep", () => {
  it("snaps to the nearest step without float drift", () => {
    expect(snapToStep(0.30000000000000004, TEMP)).toBe(0.3);
    expect(snapToStep(0.7000000001, TEMP)).toBe(0.7);
    expect(snapToStep(0.14, TEMP)).toBe(0.1);
    expect(snapToStep(0.16, TEMP)).toBe(0.2);
    expect(snapToStep(0.33, TOPP)).toBe(0.35);
  });
  it("clamps to the range", () => {
    expect(snapToStep(-3, TEMP)).toBe(0);
    expect(snapToStep(99, TEMP)).toBe(2);
    expect(snapToStep(1.2, TOPP)).toBe(1);
  });
  it("maps NaN/Infinity to min instead of poisoning the request", () => {
    expect(snapToStep(Number.NaN, TEMP)).toBe(0);
    expect(snapToStep(Number.POSITIVE_INFINITY, TEMP)).toBe(0);
  });
  it("hits both ends exactly", () => {
    expect(snapToStep(0, TEMP)).toBe(0);
    expect(snapToStep(2, TEMP)).toBe(2);
    expect(snapToStep(1, TOPP)).toBe(1);
  });
});

describe("sliderFraction / formatSliderValue", () => {
  it("returns 0..1", () => {
    expect(sliderFraction(0, TEMP)).toBe(0);
    expect(sliderFraction(1, TEMP)).toBe(0.5);
    expect(sliderFraction(2, TEMP)).toBe(1);
    expect(sliderFraction(5, TEMP)).toBe(1);
    expect(sliderFraction(-1, TEMP)).toBe(0);
  });
  it("is 0 for a degenerate range", () => {
    expect(sliderFraction(1, { min: 1, max: 1, step: 1 })).toBe(0);
  });
  it("formats with the step's decimals", () => {
    expect(formatSliderValue(0.7, 0.1)).toBe("0.7");
    expect(formatSliderValue(1, 0.1)).toBe("1.0");
    expect(formatSliderValue(0.25, 0.05)).toBe("0.25");
  });
});

describe("max-output stepper", () => {
  it("picks a step by model ceiling", () => {
    expect(maxTokensStep(16_384)).toBe(256);
    expect(maxTokensStep(4096)).toBe(256);
    expect(maxTokensStep(2048)).toBe(128);
    expect(maxTokensStep(256)).toBe(32);
  });

  it("first press from default (null) lands on the start value, either direction", () => {
    expect(stepMaxTokens(null, 1, 16_384)).toBe(1024);
    expect(stepMaxTokens(null, -1, 16_384)).toBe(1024);
    expect(maxTokensStart(200)).toBe(200); // small ceiling caps the start
    expect(stepMaxTokens(null, 1, 200)).toBe(200);
  });

  it("moves by one step and clamps at both ends", () => {
    expect(stepMaxTokens(1024, 1, 16_384)).toBe(1280);
    expect(stepMaxTokens(1024, -1, 16_384)).toBe(768);
    expect(stepMaxTokens(16_384, 1, 16_384)).toBe(16_384);
    expect(stepMaxTokens(256, -1, 16_384)).toBe(256);
  });

  it("can always reach a ceiling that is not a multiple of the step", () => {
    // ceiling 200, step 32 → 168 + 32 = 200 (clamped, not 200.0000x or 232)
    expect(stepMaxTokens(168, 1, 200)).toBe(200);
    expect(stepMaxTokens(200, -1, 200)).toBe(168);
  });

  it("reports when a direction is exhausted", () => {
    expect(canStepMaxTokens(null, 1, 16_384)).toBe(true);
    expect(canStepMaxTokens(null, -1, 16_384)).toBe(true);
    expect(canStepMaxTokens(16_384, 1, 16_384)).toBe(false);
    expect(canStepMaxTokens(256, -1, 16_384)).toBe(false);
    expect(canStepMaxTokens(512, -1, 16_384)).toBe(true);
  });

  it("clamps a stored value to a newly selected smaller model", () => {
    expect(clampMaxTokens(8000, 256)).toBe(256);
    expect(clampMaxTokens(100, 256)).toBe(100);
    expect(clampMaxTokens(null, 256)).toBeNull();
  });
});
