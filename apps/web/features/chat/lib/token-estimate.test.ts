import { describe, it, expect } from "vitest";
import { estimateTokenCount } from "@ai-platform/config";

import {
  codePointWeight,
  estimateTokensWeighted,
  tokenWeight,
  WEIGHTS,
} from "./token-estimate";

describe("estimateTokensWeighted", () => {
  it("is 0 for the empty string", () => {
    expect(estimateTokensWeighted("")).toBe(0);
  });

  it("matches the server's ceil(chars/4) for plain English letters and spaces", () => {
    for (const s of [
      "hello",
      "hello world this is a plain english sentence",
      "The quick brown fox jumps over the lazy dog",
      "a",
      "x".repeat(41),
    ]) {
      expect(estimateTokensWeighted(s)).toBe(estimateTokenCount(s));
    }
  });

  it("quotes Arabic HIGHER than chars/4 (Arabic costs more tokens per character)", () => {
    const arabic = "اكتب لي رسالة بريد إلكتروني مهنية لطلب تمديد موعد تسليم المشروع";
    expect(estimateTokensWeighted(arabic)).toBeGreaterThan(estimateTokenCount(arabic));
    // ~1.8× for letters, but never absurd: stay under 3× chars/4.
    expect(estimateTokensWeighted(arabic)).toBeLessThan(estimateTokenCount(arabic) * 3);
  });

  it("counts diacritics and tatweel, which chars/4 treats like any letter", () => {
    const plain = "كتب";
    const marked = "كَتَبَ";
    expect(tokenWeight(marked)).toBeGreaterThan(tokenWeight(plain));
  });

  it("counts an emoji as ONE code point, not two UTF-16 units", () => {
    expect("😀".length).toBe(2); // the trap this guards
    expect(tokenWeight("😀")).toBe(WEIGHTS.astral);
    expect(estimateTokensWeighted("😀")).toBe(2);
  });

  it("quotes CJK at about a token per character", () => {
    expect(estimateTokensWeighted("你好世界")).toBe(4);
  });

  it("treats digits and symbols as costlier than letters", () => {
    expect(tokenWeight("1234")).toBeGreaterThan(tokenWeight("abcd"));
    expect(tokenWeight("{};()")).toBeGreaterThan(tokenWeight("abcde"));
  });

  it("handles mixed Arabic + code + emoji without throwing and in a sane range", () => {
    const mixed = "اشرح هذا الكود:\n```js\nconst x = 1;\n```\n😀";
    const n = estimateTokensWeighted(mixed);
    expect(n).toBeGreaterThan(estimateTokenCount(mixed));
    expect(Number.isInteger(n)).toBe(true);
  });

  it("does not choke on a lone surrogate (malformed input)", () => {
    expect(() => estimateTokensWeighted("a\ud83dz")).not.toThrow();
  });
});

describe("codePointWeight", () => {
  it("classifies representative code points", () => {
    expect(codePointWeight("a".codePointAt(0)!)).toBe(WEIGHTS.latin);
    expect(codePointWeight(" ".codePointAt(0)!)).toBe(WEIGHTS.latin);
    expect(codePointWeight("7".codePointAt(0)!)).toBe(WEIGHTS.digit);
    expect(codePointWeight("#".codePointAt(0)!)).toBe(WEIGHTS.asciiSymbol);
    expect(codePointWeight("ب".codePointAt(0)!)).toBe(WEIGHTS.arabic);
    expect(codePointWeight(0x064e)).toBe(WEIGHTS.arabicMark); // fatha
    expect(codePointWeight(0x0663)).toBe(WEIGHTS.arabicMark); // Arabic-Indic 3
    expect(codePointWeight("中".codePointAt(0)!)).toBe(WEIGHTS.cjk);
    expect(codePointWeight(0x1f600)).toBe(WEIGHTS.astral);
    expect(codePointWeight(0x2764)).toBe(WEIGHTS.bmpSymbol); // ❤
    expect(codePointWeight(0x200d)).toBe(WEIGHTS.bmpSymbol); // ZWJ
    expect(codePointWeight("й".codePointAt(0)!)).toBe(WEIGHTS.other);
  });
});
