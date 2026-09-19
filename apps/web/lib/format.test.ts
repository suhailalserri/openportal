import { describe, it, expect } from "vitest";
import { formatCredits } from "./format";

describe("formatCredits", () => {
  // 1 credit = 1,000,000 micro-credits (MICRO_CREDIT, @ai-platform/config).
  const cases: Array<[number, string]> = [
    [0, "0"],
    [1, "0"], // sub-cent amounts round to 0, not garbage like "1e-6"
    [999_999, "1"], // just under a full credit rounds UP to 1, doesn't floor to 0
    [1_000_000, "1"],
    [2_670_000_000, "2,670"],
  ];

  it.each(cases)("formats %i micro-credits as %s in en-US", (micro, expected) => {
    expect(formatCredits(micro, "en")).toBe(expected);
  });

  // D6 (locked 1.1): Arabic UI still uses Western digits. The point of
  // this test is the digit shape, not the grouping punctuation (ICU's
  // ar-SA thousands separator can vary across Node/ICU builds) — so it
  // asserts no Eastern Arabic-Indic numerals appear, rather than an
  // exact string match.
  it.each(cases.map(([micro]) => micro))(
    "renders only Western digits for %i micro-credits in ar-SA",
    (micro) => {
      const out = formatCredits(micro, "ar");
      expect(out).not.toMatch(/[\u0660-\u0669]/); // ٠-٩
      expect(out).toMatch(/[0-9]/);
    }
  );
});
