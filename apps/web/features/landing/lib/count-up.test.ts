import { describe, it, expect } from "vitest";

import { countUpValue, easeOutCubic } from "./count-up";

describe("easeOutCubic", () => {
  it("maps the endpoints exactly", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("clamps out-of-range and non-finite input", () => {
    expect(easeOutCubic(-5)).toBe(0);
    expect(easeOutCubic(9)).toBe(1);
    expect(easeOutCubic(Number.NaN)).toBe(0);
  });
  it("is monotonic non-decreasing", () => {
    let last = -1;
    for (let i = 0; i <= 100; i++) {
      const v = easeOutCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
  it("is front-loaded (fast start): already past halfway at t=0.3", () => {
    expect(easeOutCubic(0.3)).toBeGreaterThan(0.5);
  });
});

describe("countUpValue", () => {
  it("starts at 0 and lands EXACTLY on the target", () => {
    expect(countUpValue(1240, 0, 1500)).toBe(0);
    expect(countUpValue(1240, 1500, 1500)).toBe(1240);
    expect(countUpValue(1240, 99_999, 1500)).toBe(1240);
  });
  it("always returns an integer", () => {
    for (let ms = 0; ms <= 1500; ms += 37) {
      expect(Number.isInteger(countUpValue(1240, ms, 1500))).toBe(true);
    }
  });
  it("never overshoots the target and never goes negative", () => {
    for (const target of [1, 7, 24, 1240, 100_000]) {
      for (let ms = 0; ms <= 2000; ms += 13) {
        const v = countUpValue(target, ms, 1500);
        expect(v).toBeLessThanOrEqual(target);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("never decreases as time advances", () => {
    let last = -1;
    for (let ms = 0; ms <= 1600; ms += 10) {
      const v = countUpValue(1240, ms, 1500);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
  it("rounds a fractional target to the nearest whole number", () => {
    expect(countUpValue(23.6, 5000, 1000)).toBe(24);
  });
  it("a target of zero (or negative) shows 0 at every moment", () => {
    expect(countUpValue(0, 500, 1000)).toBe(0);
    expect(countUpValue(-9, 500, 1000)).toBe(0);
    expect(countUpValue(0, 5000, 1000)).toBe(0);
  });
  it("a non-finite target shows 0 rather than NaN", () => {
    expect(countUpValue(Number.NaN, 500, 1000)).toBe(0);
    expect(countUpValue(Number.POSITIVE_INFINITY, 500, 1000)).toBe(0);
  });
  it("a zero / negative / non-finite duration jumps straight to the real number", () => {
    expect(countUpValue(1240, 0, 0)).toBe(1240);
    expect(countUpValue(1240, 100, -50)).toBe(1240);
    expect(countUpValue(1240, 100, Number.NaN)).toBe(1240);
  });
  it("a negative elapsed time shows 0 (not started yet)", () => {
    expect(countUpValue(1240, -10, 1000)).toBe(0);
  });
  it("a NaN elapsed time fails toward the REAL number, never a made-up midpoint", () => {
    expect(countUpValue(1240, Number.NaN, 1000)).toBe(1240);
  });
});
