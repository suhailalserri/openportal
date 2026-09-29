import { describe, it, expect } from "vitest";
import {
  assertUsableAccount, ACCOUNT_ERROR_CODE, ACCOUNT_REST_ERROR,
} from "./account-guard";

describe("assertUsableAccount", () => {
  it("allows an active, unflagged account", () => {
    expect(assertUsableAccount({ status: "active", isFraudFlagged: false })).toEqual({ ok: true });
  });

  it("refuses a suspended account", () => {
    expect(assertUsableAccount({ status: "suspended", isFraudFlagged: false }))
      .toEqual({ ok: false, reason: "suspended" });
  });

  it("refuses a fraud-flagged account", () => {
    expect(assertUsableAccount({ status: "active", isFraudFlagged: true }))
      .toEqual({ ok: false, reason: "fraud_flagged" });
  });

  it("reports suspended first when both apply", () => {
    expect(assertUsableAccount({ status: "suspended", isFraudFlagged: true }))
      .toEqual({ ok: false, reason: "suspended" });
  });

  it("refuses pending_verification, matching the pre-existing REST behaviour", () => {
    expect(assertUsableAccount({ status: "pending_verification", isFraudFlagged: false }))
      .toEqual({ ok: false, reason: "suspended" });
  });

  it("keeps the external strings stable", () => {
    expect(ACCOUNT_ERROR_CODE).toEqual({
      suspended: "ACCOUNT_SUSPENDED", fraud_flagged: "ACCOUNT_UNDER_REVIEW",
    });
    expect(ACCOUNT_REST_ERROR).toEqual({
      suspended: "Account suspended", fraud_flagged: "Account under review",
    });
  });
});
