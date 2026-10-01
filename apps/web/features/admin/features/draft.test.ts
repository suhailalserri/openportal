import { describe, expect, it } from "vitest";

import { isFeatureDraftDirty } from "./draft";

const off = { attachments: false, voice: false, thinking: false };

describe("isFeatureDraftDirty", () => {
  it("same values -> not dirty", () => {
    expect(isFeatureDraftDirty(off, { ...off })).toBe(false);
  });
  it("any one switch different -> dirty", () => {
    expect(isFeatureDraftDirty(off, { ...off, attachments: true })).toBe(true);
    expect(isFeatureDraftDirty(off, { ...off, voice: true })).toBe(true);
    expect(isFeatureDraftDirty(off, { ...off, thinking: true })).toBe(true);
  });
});
