import { describe, it, expect } from "vitest";

import { compactTokens, formatInteger, formatYerPrecise, responseSeconds } from "./format-price";

describe("formatYerPrecise", () => {
  it("renders zero, negative and non-finite amounts as '0'", () => {
    expect(formatYerPrecise(0, "en")).toBe("0");
    expect(formatYerPrecise(-1, "en")).toBe("0");
    expect(formatYerPrecise(Number.NaN, "en")).toBe("0");
    // Documented choice: a corrupt price never crashes the page. (The
    // builder decides "free" from isFreeModel, not from this string.)
    expect(formatYerPrecise(Number.POSITIVE_INFINITY, "en")).toBe("0");
  });

  it("shows a non-zero amount below one hundredth as '<0.01', never as '0'", () => {
    expect(formatYerPrecise(0.001, "en")).toBe("<0.01");
    expect(formatYerPrecise(0.0099, "en")).toBe("<0.01");
    expect(formatYerPrecise(0.01, "en")).toBe("0.01");
  });

  it("uses up to 2 decimals below 10, 1 decimal below 100, whole above", () => {
    expect(formatYerPrecise(1.234, "en")).toBe("1.23");
    expect(formatYerPrecise(0.5, "en")).toBe("0.5");
    expect(formatYerPrecise(10.06, "en")).toBe("10.1");
    expect(formatYerPrecise(99.94, "en")).toBe("99.9");
    expect(formatYerPrecise(100.5, "en")).toBe("101");
  });

  it("groups thousands", () => {
    expect(formatYerPrecise(1234.5, "en")).toBe("1,235");
    expect(formatYerPrecise(12_345_678, "en")).toBe("12,345,678");
  });

  it("rounds across a band boundary without printing a stray decimal", () => {
    expect(formatYerPrecise(9.999, "en")).toBe("10");
    expect(formatYerPrecise(99.96, "en")).toBe("100");
  });

  it("D6: Arabic locale still renders Western digits (0-9), never Arabic-Indic", () => {
    for (const v of [0.5, 1.23, 12, 345.6, 1234.5, 12_345_678]) {
      const out = formatYerPrecise(v, "ar");
      expect(/[\u0660-\u0669\u06F0-\u06F9]/.test(out)).toBe(false);
      expect(/[0-9]/.test(out)).toBe(true);
    }
  });

  it("gives the same number in both locales (only separators may differ)", () => {
    expect(formatYerPrecise(1.23, "ar")).toBe(formatYerPrecise(1.23, "en"));
  });
});

describe("formatInteger", () => {
  it("rounds to a whole number with grouping and Western digits", () => {
    expect(formatInteger(1_234_567.6, "en")).toBe("1,234,568");
    expect(formatInteger(0.4, "en")).toBe("0");
    expect(/[\u0660-\u0669]/.test(formatInteger(1_000, "ar"))).toBe(false);
  });
});

describe("compactTokens", () => {
  it("leaves values under 1,000 raw", () => {
    expect(compactTokens(0)).toEqual({ unit: "raw", value: 0 });
    expect(compactTokens(999)).toEqual({ unit: "raw", value: 999 });
  });
  it("uses K from 1,000 up to a million", () => {
    expect(compactTokens(1_000)).toEqual({ unit: "K", value: 1 });
    expect(compactTokens(8_192)).toEqual({ unit: "K", value: 8 });
    expect(compactTokens(128_000)).toEqual({ unit: "K", value: 128 });
    expect(compactTokens(200_000)).toEqual({ unit: "K", value: 200 });
  });
  it("uses M from a million, with one decimal", () => {
    expect(compactTokens(1_000_000)).toEqual({ unit: "M", value: 1 });
    expect(compactTokens(1_048_576)).toEqual({ unit: "M", value: 1 });
    expect(compactTokens(1_500_000)).toEqual({ unit: "M", value: 1.5 });
    expect(compactTokens(2_000_000)).toEqual({ unit: "M", value: 2 });
  });
});

describe("responseSeconds", () => {
  it("returns null for unknown / non-positive / non-finite input", () => {
    for (const v of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(responseSeconds(v as number | null | undefined)).toBeNull();
    }
  });
  it("converts ms to seconds with one decimal", () => {
    expect(responseSeconds(1234)).toBe(1.2);
    expect(responseSeconds(1999)).toBe(2);
    expect(responseSeconds(60_000)).toBe(60);
  });
});
