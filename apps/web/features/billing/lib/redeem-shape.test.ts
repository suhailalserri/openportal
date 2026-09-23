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

  it("the first 12 chars of the alphabet round-trip as the three body groups", () => {
    expect(REDEEM_CODE_ALPHABET.length).toBeGreaterThan(12);
    const first12 = REDEEM_CODE_ALPHABET.slice(0, 12);
    expect(formatRedeemInput(first12)).toBe(`${first12.slice(0, 4)}-${first12.slice(4, 8)}-${first12.slice(8, 12)}`);
  });

  // Regression: the checksum group is hex (0-9A-F), so a real code such as
  // JUHP-XFSR-J936-EE19 has a "1" that the body alphabet excludes. It used
  // to be deleted on paste/typing, making the code impossible to enter.
  it("keeps 0 and 1 in the checksum group (real code JUHP-XFSR-J936-EE19)", () => {
    expect(formatRedeemInput("JUHP-XFSR-J936-EE19")).toBe("JUHP-XFSR-J936-EE19");
    expect(formatRedeemInput("juhpxfsrj936ee19")).toBe("JUHP-XFSR-J936-EE19");
    expect(formatRedeemInput("JUHP-XFSR-J936-EE1")).toBe("JUHP-XFSR-J936-EE1");
    expect(formatRedeemInput("ABCD-2345-EFGH-0A1F")).toBe("ABCD-2345-EFGH-0A1F");
  });

  it("still drops 0/1/O/I/L in the three body groups, and non-hex letters in the checksum", () => {
    expect(formatRedeemInput("A0B1CDEF-2345-6789-0000")).toBe("ABCD-EF23-4567-8900");
    expect(formatRedeemInput("ABCD-2345-EFGH-GHIJ")).toBe("ABCD-2345-EFGH");
  });

  it("caps at 16 characters even when the tail is valid hex", () => {
    expect(formatRedeemInput("JUHPXFSRJ936EE19FFFF")).toBe("JUHP-XFSR-J936-EE19");
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

  it("accepts the hex checksum group with 0 and 1, rejects them in the body", () => {
    expect(isRedeemShapeComplete("JUHP-XFSR-J936-EE19")).toBe(true);
    expect(isRedeemShapeComplete("JUHP-XFSR-J936-0A1F")).toBe(true);
    expect(isRedeemShapeComplete("JUH1-XFSR-J936-EE19")).toBe(false);
  });

  it("rejects a non-hex letter in the checksum group", () => {
    expect(isRedeemShapeComplete("ABCD-2345-EFGH-6GHJ")).toBe(false);
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
