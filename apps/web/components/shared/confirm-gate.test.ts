import { describe, expect, it } from "vitest";

import { isConfirmBlocked } from "./confirm-gate";

const base = { isPending: false, confirmDisabled: false, requireTypedConfirmation: undefined, typedText: "" };

describe("isConfirmBlocked", () => {
  it("is open when nothing gates it", () => {
    expect(isConfirmBlocked(base)).toBe(false);
  });

  it("is blocked while a mutation is pending", () => {
    expect(isConfirmBlocked({ ...base, isPending: true })).toBe(true);
  });

  it("is blocked when the caller marks the form not ready", () => {
    expect(isConfirmBlocked({ ...base, confirmDisabled: true })).toBe(true);
  });

  it("stays blocked until the typed text matches exactly", () => {
    const gate = { ...base, requireTypedConfirmation: { targetText: "a@b.co" } };
    expect(isConfirmBlocked({ ...gate, typedText: "" })).toBe(true);
    expect(isConfirmBlocked({ ...gate, typedText: "a@b." })).toBe(true);
    expect(isConfirmBlocked({ ...gate, typedText: "A@B.CO" })).toBe(true);
    expect(isConfirmBlocked({ ...gate, typedText: "a@b.co" })).toBe(false);
  });

  it("a matching typed text does not override pending or not-ready", () => {
    const gate = { ...base, requireTypedConfirmation: { targetText: "5" }, typedText: "5" };
    expect(isConfirmBlocked({ ...gate, isPending: true })).toBe(true);
    expect(isConfirmBlocked({ ...gate, confirmDisabled: true })).toBe(true);
  });
});
