import { describe, it, expect } from "vitest";

import { reconcilePanel, togglePanel } from "./composer-panels";

describe("togglePanel", () => {
  it("opens a closed panel", () => {
    expect(togglePanel(null, "model")).toBe("model");
    expect(togglePanel(null, "params")).toBe("params");
  });
  it("closes the panel when its own button is tapped again", () => {
    expect(togglePanel("model", "model")).toBeNull();
    expect(togglePanel("params", "params")).toBeNull();
  });
  it("switches directly to the other panel (only one open at a time)", () => {
    expect(togglePanel("model", "params")).toBe("params");
    expect(togglePanel("params", "model")).toBe("model");
  });
});

describe("reconcilePanel", () => {
  it("keeps an open panel whose trigger is still available", () => {
    expect(reconcilePanel("model", { model: true, params: false })).toBe("model");
    expect(reconcilePanel(null, { model: false, params: false })).toBeNull();
  });
  it("closes a panel whose trigger vanished (e.g. models list emptied)", () => {
    expect(reconcilePanel("model", { model: false, params: true })).toBeNull();
    expect(reconcilePanel("params", { model: true, params: false })).toBeNull();
  });
});
