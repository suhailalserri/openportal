import { describe, it, expect } from "vitest";

import {
  creditsForTokens,
  estimateRequestTokens,
  formatQuote,
  roundQuoteUp,
  unitPrice,
} from "./cost-estimate";
import { MESSAGE_OVERHEAD_TOKENS } from "./token-estimate";

describe("unitPrice", () => {
  const base = { creditsPerKInput: 1, creditsPerKOutput: 2 };

  it("falls back to the API's rounded-up price and says it is not exact", () => {
    expect(unitPrice(base, "input")).toEqual({ perK: 1, exact: false });
    expect(unitPrice(base, "output")).toEqual({ perK: 2, exact: false });
  });

  it("prefers the exact fractional price when the API provides it", () => {
    const m = { ...base, creditsPerKInputExact: 0.3, creditsPerKOutputExact: 1.2 };
    expect(unitPrice(m, "input")).toEqual({ perK: 0.3, exact: true });
    expect(unitPrice(m, "output")).toEqual({ perK: 1.2, exact: true });
  });

  it("accepts an exact price of 0 (a free model) rather than falling back", () => {
    expect(unitPrice({ ...base, creditsPerKInputExact: 0 }, "input")).toEqual({
      perK: 0,
      exact: true,
    });
  });

  it("ignores a NaN / negative exact value and uses the rounded one", () => {
    expect(unitPrice({ ...base, creditsPerKInputExact: Number.NaN }, "input").exact).toBe(false);
    expect(unitPrice({ ...base, creditsPerKInputExact: -1 }, "input").exact).toBe(false);
  });
});

describe("estimateRequestTokens", () => {
  it("is 0 when there is nothing to send", () => {
    expect(estimateRequestTokens({ history: [], draft: "" })).toBe(0);
    expect(estimateRequestTokens({ history: [], draft: "   " })).toBe(0);
  });

  it("adds per-message framing", () => {
    const one = estimateRequestTokens({ history: [], draft: "abcd" }); // 1 + overhead
    expect(one).toBe(1 + MESSAGE_OVERHEAD_TOKENS);
  });

  it("covers the WHOLE request: history + draft", () => {
    const draftOnly = estimateRequestTokens({ history: [], draft: "hi there" });
    const withHistory = estimateRequestTokens({
      history: [{ content: "a".repeat(400) }],
      draft: "hi there",
    });
    expect(withHistory).toBeGreaterThan(draftOnly + 90);
  });

  it("quotes an Arabic draft above the same-length English draft", () => {
    const ar = estimateRequestTokens({ history: [], draft: "مرحبا بك في المنصة الجديدة" });
    const en = estimateRequestTokens({ history: [], draft: "x".repeat("مرحبا بك في المنصة الجديدة".length) });
    expect(ar).toBeGreaterThan(en);
  });
});

describe("creditsForTokens", () => {
  it("is tokens/1000 × credits per K", () => {
    expect(creditsForTokens(2000, 5)).toBe(10);
    expect(creditsForTokens(500, 1)).toBe(0.5);
  });
  it("is 0 for zero/negative/non-finite input instead of NaN", () => {
    expect(creditsForTokens(0, 5)).toBe(0);
    expect(creditsForTokens(-5, 5)).toBe(0);
    expect(creditsForTokens(100, 0)).toBe(0);
    expect(creditsForTokens(Number.NaN, 5)).toBe(0);
    expect(creditsForTokens(100, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("roundQuoteUp", () => {
  it("rounds UP to 0.01 below 100 (never to nearest)", () => {
    expect(roundQuoteUp(0.001)).toBe(0.01);
    expect(roundQuoteUp(0.011)).toBe(0.02);
    expect(roundQuoteUp(1.231)).toBe(1.24);
  });
  it("does not tick an exact cent up because of float error", () => {
    expect(roundQuoteUp(0.3)).toBe(0.3);
    expect(roundQuoteUp(0.1 + 0.2)).toBe(0.3);
    expect(roundQuoteUp(1.15)).toBe(1.15);
  });
  it("rounds up to a whole credit from 100", () => {
    expect(roundQuoteUp(100.01)).toBe(101);
    expect(roundQuoteUp(100)).toBe(100);
  });
  it("is 0 for 0 / negative / non-finite", () => {
    expect(roundQuoteUp(0)).toBe(0);
    expect(roundQuoteUp(-1)).toBe(0);
    expect(roundQuoteUp(Number.NaN)).toBe(0);
  });
});

describe("formatQuote", () => {
  it("uses Western digits in the Arabic locale (D6)", () => {
    expect(formatQuote(12.5, "ar")).toMatch(/^[0-9.,٫]+$/);
    expect(formatQuote(12.5, "ar")).not.toMatch(/[٠-٩]/);
  });
  it("formats en", () => {
    expect(formatQuote(0.004, "en")).toBe("0.01");
    expect(formatQuote(1234.2, "en")).toBe("1,235");
  });
});
