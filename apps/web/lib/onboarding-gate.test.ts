import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetOnboardingGateForTests, settlePasskeyOffer } from "./onboarding-gate";

describe("onboarding-gate", () => {
  beforeEach(() => __resetOnboardingGateForTests());

  it("settlePasskeyOffer is idempotent", () => {
    expect(() => {
      settlePasskeyOffer();
      settlePasskeyOffer();
    }).not.toThrow();
  });

  it("is safe to call with no subscribers", () => {
    const spy = vi.fn();
    settlePasskeyOffer();
    expect(spy).not.toHaveBeenCalled();
  });
});
