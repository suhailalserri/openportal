import { describe, expect, it } from "vitest";
import { toClaimErrorCode } from "./use-welcome-bonus";

describe("toClaimErrorCode", () => {
  it("passes through the stable server codes", () => {
    for (const code of ["ALREADY_CLAIMED", "DISABLED", "NOT_ELIGIBLE", "ACCOUNT_RESTRICTED"]) {
      expect(toClaimErrorCode(new Error(code))).toBe(code);
    }
  });

  it("maps a tRPC rate-limit error", () => {
    const err = Object.assign(new Error("محاولات كثيرة"), { data: { code: "TOO_MANY_REQUESTS" } });
    expect(toClaimErrorCode(err)).toBe("TOO_MANY_REQUESTS");
  });

  it("falls back to generic for anything unknown (never leaks a raw message)", () => {
    expect(toClaimErrorCode(new Error("boom: stack trace"))).toBe("generic");
    expect(toClaimErrorCode(null)).toBe("generic");
    expect(toClaimErrorCode("x")).toBe("generic");
  });
});
