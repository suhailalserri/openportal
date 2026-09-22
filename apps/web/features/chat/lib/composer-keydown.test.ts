import { describe, it, expect } from "vitest";

import { shouldSendOnKeydown, type KeydownLike } from "./composer-keydown";

/**
 * Phase 4c's required IME test (FRONTEND_REBUILD_PLAN.md, 4c "Breaks if
 * wrong": Enter during Arabic IME composition sends half-typed text; the
 * `isComposing` guard + a unit test prevent it).
 */
function ev(overrides: Partial<KeydownLike> = {}): KeydownLike {
  return { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, ...overrides };
}

describe("shouldSendOnKeydown", () => {
  it("sends on a plain Enter", () => {
    expect(shouldSendOnKeydown(ev())).toBe(true);
  });

  it("does NOT send on Enter while an IME composition is active (isComposing)", () => {
    expect(shouldSendOnKeydown(ev({ isComposing: true }))).toBe(false);
  });

  it("does NOT send on Safari's post-composition Enter (isComposing already false, keyCode 229)", () => {
    // Safari fires compositionend BEFORE the final keydown, so isComposing
    // is false by the time this Enter arrives; keyCode 229 is the only
    // remaining signal. Checking isComposing alone would misfire here.
    expect(shouldSendOnKeydown(ev({ isComposing: false, keyCode: 229 }))).toBe(false);
  });

  it("does NOT send on Shift+Enter (newline)", () => {
    expect(shouldSendOnKeydown(ev({ shiftKey: true }))).toBe(false);
  });

  it("does NOT send on Shift+Enter even during composition", () => {
    expect(shouldSendOnKeydown(ev({ shiftKey: true, isComposing: true }))).toBe(false);
  });

  it("ignores every non-Enter key", () => {
    for (const key of ["a", " ", "Tab", "Escape", "ArrowUp", "Backspace"]) {
      expect(shouldSendOnKeydown(ev({ key }))).toBe(false);
    }
  });
});

/**
 * Post-4d bugfix round: regression coverage for the mobile Enter bug —
 * a phone's on-screen "return" key fired a plain, non-composing Enter
 * that this function used to treat as send, making it impossible to
 * type a newline in the composer on any touch device.
 */
describe("shouldSendOnKeydown — mobile/coarse-pointer devices", () => {
  it("does NOT send on Enter when isCoarsePointer is true (mobile virtual keyboard)", () => {
    expect(shouldSendOnKeydown(ev({ isCoarsePointer: true }))).toBe(false);
  });

  it("still does not send on Shift+Enter on a coarse pointer either", () => {
    expect(shouldSendOnKeydown(ev({ isCoarsePointer: true, shiftKey: true }))).toBe(false);
  });

  it("defaults to desktop (sends) when isCoarsePointer is omitted", () => {
    expect(shouldSendOnKeydown(ev())).toBe(true);
  });

  it("still sends on a plain desktop Enter when isCoarsePointer is explicitly false", () => {
    expect(shouldSendOnKeydown(ev({ isCoarsePointer: false }))).toBe(true);
  });
});
