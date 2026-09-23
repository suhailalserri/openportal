import { describe, it, expect } from "vitest";

import { buildCsv } from "./csv";

/**
 * apps/web/lib/csv.test.ts (Phase 8b)
 *
 * `downloadCsv` isn't tested here — it's a thin DOM/Blob side effect
 * (jsdom has no real download), not worth mocking `URL.createObjectURL`
 * for. `buildCsv` is the part with actual logic (the formula-injection
 * guard + RFC 4180 quoting) and is pure, so it's fully covered.
 */
describe("buildCsv", () => {
  it("quotes every header and cell", () => {
    expect(buildCsv(["A", "B"], [["1", "2"]])).toBe('"A","B"\r\n"1","2"');
  });

  it("doubles embedded quotes", () => {
    expect(buildCsv(["H"], [['say "hi"']])).toBe('"H"\r\n"say ""hi"""');
  });

  it("prefixes a leading apostrophe on cells starting with = + - @ tab or CR", () => {
    for (const risky of ["=SUM(A1)", "+1", "-1", "@cmd", "\ttab", "\rcr"]) {
      const csv = buildCsv(["H"], [[risky]]);
      const cell = csv.split("\r\n")[1];
      expect(cell).toBe(`"'${risky}"`);
    }
  });

  it("does not prefix ordinary cells", () => {
    const csv = buildCsv(["H"], [["ABCD-1234-EFGH-5678"]]);
    expect(csv.split("\r\n")[1]).toBe('"ABCD-1234-EFGH-5678"');
  });

  it("renders null/undefined cells as an empty quoted string", () => {
    const csv = buildCsv(["H"], [[null], [undefined]]);
    const [, row1, row2] = csv.split("\r\n");
    expect(row1).toBe('""');
    expect(row2).toBe('""');
  });

  it("joins rows with CRLF", () => {
    const csv = buildCsv(["H"], [["a"], ["b"]]);
    expect(csv).toBe('"H"\r\n"a"\r\n"b"');
  });
});
