import { describe, it, expect } from "vitest";

import { normalizeDigits, parseParam, paramToText } from "./param-input";

const TEMP = { min: 0, max: 2 };

describe("normalizeDigits", () => {
  it("converts Arabic-Indic and Persian digits and Arabic separators", () => {
    expect(normalizeDigits("٠٫٧")).toBe("0.7");
    expect(normalizeDigits("۱۲۸")).toBe("128");
    expect(normalizeDigits("٠،٥")).toBe("0.5");
  });
  it("trims whitespace", () => {
    expect(normalizeDigits("  0.5 ")).toBe("0.5");
  });
});

describe("parseParam", () => {
  it("treats an empty / whitespace-only field as UNSET (not invalid)", () => {
    expect(parseParam("", TEMP)).toEqual({ kind: "unset" });
    expect(parseParam("   ", TEMP)).toEqual({ kind: "unset" });
  });

  it("parses valid decimals and integers, including the bounds", () => {
    expect(parseParam("0.7", TEMP)).toEqual({ kind: "valid", value: 0.7 });
    expect(parseParam("0", TEMP)).toEqual({ kind: "valid", value: 0 });
    expect(parseParam("2", TEMP)).toEqual({ kind: "valid", value: 2 });
    expect(parseParam(".5", TEMP)).toEqual({ kind: "valid", value: 0.5 });
  });

  it("accepts Arabic-Indic input", () => {
    expect(parseParam("٠٫٧", TEMP)).toEqual({ kind: "valid", value: 0.7 });
  });

  it("rejects out-of-range values with out_of_range", () => {
    expect(parseParam("2.01", TEMP)).toEqual({ kind: "invalid", reason: "out_of_range" });
    expect(parseParam("5", TEMP)).toEqual({ kind: "invalid", reason: "out_of_range" });
  });

  it("rejects non-numeric shapes that Number() would happily accept", () => {
    for (const bad of ["1e3", "0x10", "Infinity", "NaN", "--1", "-1", "1,000", "abc", "1.2.3", "."]) {
      expect(parseParam(bad, { min: 0, max: 1e9 })).toEqual({ kind: "invalid", reason: "not_a_number" });
    }
  });

  it("enforces integers when asked (max_tokens)", () => {
    const L = { min: 1, max: 8192 };
    expect(parseParam("512", L, { integer: true })).toEqual({ kind: "valid", value: 512 });
    expect(parseParam("512.5", L, { integer: true })).toEqual({ kind: "invalid", reason: "not_integer" });
    expect(parseParam("0", L, { integer: true })).toEqual({ kind: "invalid", reason: "out_of_range" });
    expect(parseParam("9000", L, { integer: true })).toEqual({ kind: "invalid", reason: "out_of_range" });
  });

  it("allows an in-progress trailing dot so typing '0.' then '0.7' works", () => {
    expect(parseParam("0.", TEMP)).toEqual({ kind: "valid", value: 0 });
    expect(parseParam("1.", TEMP)).toEqual({ kind: "valid", value: 1 });
  });
});

describe("paramToText", () => {
  it("maps null to empty and numbers to their string", () => {
    expect(paramToText(null)).toBe("");
    expect(paramToText(0)).toBe("0");
    expect(paramToText(0.7)).toBe("0.7");
  });
});
