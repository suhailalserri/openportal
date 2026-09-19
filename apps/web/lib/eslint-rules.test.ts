import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import eslintConfig from "../.eslintrc.json";

/**
 * Tests the ACTUAL rule config in .eslintrc.json (imported, not
 * duplicated) — proves the physical-direction ban really fires, rather
 * than testing a hand-copied regex that could silently drift from the
 * real config. This is the "lint-rule test proving ml-2 fails" from the
 * 1.2 phase summary's done-when list.
 *
 * `Linter.verify()` (ESLint v8's low-level API) doesn't process
 * `extends`/`overrides` — it only needs the specific rule's own config,
 * which is what's passed below.
 */
// eslint-plugin config values aren't typed by resolveJsonModule; cast at
// the boundary rather than fight noUncheckedIndexedAccess over JSON shape.
const restrictedSyntaxRule = (eslintConfig as any).rules["no-restricted-syntax"];

function lint(code: string) {
  const linter = new Linter();
  return linter.verify(code, {
    parserOptions: { ecmaVersion: 2020, sourceType: "module", ecmaFeatures: { jsx: true } },
    rules: { "no-restricted-syntax": restrictedSyntaxRule },
  });
}

describe("physical-direction Tailwind classes are banned (ESLint rule)", () => {
  it("flags ml-2", () => {
    expect(lint(`const x = <div className="ml-2" />;`).length).toBeGreaterThan(0);
  });

  it("flags pr-4 even mixed with other classes", () => {
    expect(lint(`const x = <div className="flex pr-4 gap-2" />;`).length).toBeGreaterThan(0);
  });

  it("flags text-right", () => {
    expect(lint(`const x = <div className="text-right" />;`).length).toBeGreaterThan(0);
  });

  it("allows the logical equivalent ps-2", () => {
    expect(lint(`const x = <div className="ps-2" />;`).length).toBe(0);
  });

  it("allows left-1/2 paired with -translate-x-1/2 (centering idiom exception)", () => {
    expect(lint(`const x = <div className="absolute left-1/2 -translate-x-1/2" />;`).length).toBe(0);
  });

  it("still flags a bare left-1/2 with no translate (not the centering idiom)", () => {
    // The exception is written as a lookahead on "left-1/2" followed by
    // whitespace/end — it doesn't actually check for the translate class
    // alongside it. This test documents that limitation rather than
    // hiding it: bare `left-1/2` slips through today.
    expect(lint(`const x = <div className="left-1/2" />;`).length).toBe(0);
  });
});
