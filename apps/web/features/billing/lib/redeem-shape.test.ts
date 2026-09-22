import { describe, it, expect } from "vitest";

import { formatRedeemInput, isRedeemShapeComplete, REDEEM_CODE_ALPHABET } from "./redeem-shape";

describe("formatRedeemInput", () => {
  it("uppercases and groups into 4x4 with dashes", () => {
    expect(formatRedeemInput("abcd2345efgh6789")).toBe("ABCD-2345-EFGH-6789");
  });

  it("inserts dashes progressively while typing", () => {
    expect(formatRedeemInput("a")).toBe("A");
    expect(formatRedeemInput("abcd")).toBe("ABCD");
    expect(formatRedeemInput("abcde")).toBe("ABCD-E");
  });

  it("strips ambiguous chars not in the alphabet (0, O, 1, I, L)", () => {
    expect(formatRedeemInput("A0O1IL2345")).toBe("A234-5");
  });

  it("strips whitespace and punctuation, including dashes the user typed", () => {
    expect(formatRedeemInput("abcd-2345 efgh_6789")).toBe("ABCD-2345-EFGH-6789");
  });

  it("caps at 16 alphabet characters (4 groups)", () => {
    expect(formatRedeemInput("ABCD2345EFGH6789ZZZZ")).toBe("ABCD-2345-EFGH-6789");
  });

  it("empty input formats to empty string", () => {
    expect(formatRedeemInput("")).toBe("");
  });

  it("the first 16 chars of the alphabet constant round-trip through formatting (32-char alphabet, 16-char cap)", () => {
    expect(REDEEM_CODE_ALPHABET.length).toBeGreaterThan(16);
    const first16 = REDEEM_CODE_ALPHABET.slice(0, 16);
    expect(formatRedeemInput(first16)).toBe(
      `${first16.slice(0, 4)}-${first16.slice(4, 8)}-${first16.slice(8, 12)}-${first16.slice(12, 16)}`
    );
  });
});

describe("isRedeemShapeComplete", () => {
  it("accepts a fully-formed 4x4 code", () => {
    expect(isRedeemShapeComplete("ABCD-2345-EFGH-6789")).toBe(true);
  });

  it("rejects a partial code", () => {
    expect(isRedeemShapeComplete("ABCD-234")).toBe(false);
    expect(isRedeemShapeComplete("")).toBe(false);
  });

  it("rejects the right length with wrong grouping (no dashes)", () => {
    expect(isRedeemShapeComplete("ABCD2345EFGH6789")).toBe(false);
  });

  it("rejects a code containing an excluded ambiguous character", () => {
    // Shouldn't occur via formatRedeemInput, but the checker itself must
    // still reject it if constructed by hand (e.g. programmatic paste).
    expect(isRedeemShapeComplete("ABC0-2345-EFGH-6789")).toBe(false);
  });

  it("rejects lowercase even if otherwise valid shape", () => {
    expect(isRedeemShapeComplete("abcd-2345-efgh-6789")).toBe(false);
  });
});
