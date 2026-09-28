import { describe, expect, it } from "vitest";
import {
  KNOWN_TX_TYPES,
  getTransactionTypeMeta,
  toTransactionLabelKey,
} from "./transaction-labels";

describe("transaction-labels", () => {
  it("maps every real tx_type enum value (packages/db enums.ts) to itself as the message key", () => {
    for (const type of KNOWN_TX_TYPES) {
      expect(toTransactionLabelKey(type)).toBe(type);
    }
  });

  it("covers all 8 tx_type enum values, including refund and welcome_bonus", () => {
    expect(KNOWN_TX_TYPES).toHaveLength(8);
    expect(KNOWN_TX_TYPES).toContain("welcome_bonus");
    expect(KNOWN_TX_TYPES).toContain("refund");
  });

  it("falls back to 'unknown' for an unmapped value instead of throwing or leaking a raw string", () => {
    expect(toTransactionLabelKey("some_future_type")).toBe("unknown");
    expect(toTransactionLabelKey("")).toBe("unknown");
  });

  it("marks credit-direction types correctly", () => {
    expect(getTransactionTypeMeta("redeem").isCredit).toBe(true);
    expect(getTransactionTypeMeta("payment").isCredit).toBe(true);
    expect(getTransactionTypeMeta("referral_bonus").isCredit).toBe(true);
    expect(getTransactionTypeMeta("welcome_bonus").isCredit).toBe(true);
    expect(getTransactionTypeMeta("refund").isCredit).toBe(true);
    expect(getTransactionTypeMeta("admin_credit").isCredit).toBe(true);
  });

  it("marks debit-direction types correctly", () => {
    expect(getTransactionTypeMeta("usage_debit").isCredit).toBe(false);
    expect(getTransactionTypeMeta("admin_debit").isCredit).toBe(false);
  });

  it("gives refund and admin_credit distinct tones from plain redeem/usage", () => {
    expect(getTransactionTypeMeta("refund").tone).toBe("info");
    expect(getTransactionTypeMeta("admin_debit").tone).toBe("destructive");
    expect(getTransactionTypeMeta("unknown_type").tone).toBe("outline");
  });
});
