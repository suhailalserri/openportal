import { describe, expect, it } from "vitest";
import { buildManualPaymentInput } from "./manual-payment-input";

describe("buildManualPaymentInput", () => {
  it("omits optional keys entirely when blank/whitespace, rather than setting them to undefined", () => {
    const result = buildManualPaymentInput({
      packageId: "pkg-1",
      paymentMethodId: "method-1",
      submittedTxRef: "   ",
      senderPhone: "",
      senderName: "",
      notes: "",
    });
    expect(result).toEqual({ packageId: "pkg-1", paymentMethodId: "method-1" });
    expect("submittedTxRef" in result).toBe(false);
    expect("senderPhone" in result).toBe(false);
    expect("senderName" in result).toBe(false);
    expect("notes" in result).toBe(false);
  });

  it("trims and includes optional keys when non-empty", () => {
    const result = buildManualPaymentInput({
      packageId: "pkg-1",
      paymentMethodId: "method-1",
      submittedTxRef: "  TX123  ",
      senderPhone: " 7700000 ",
      senderName: "Fras",
      notes: "sent via Jaib app",
    });
    expect(result).toEqual({
      packageId: "pkg-1",
      paymentMethodId: "method-1",
      submittedTxRef: "TX123",
      senderPhone: "7700000",
      senderName: "Fras",
      notes: "sent via Jaib app",
    });
  });

  it("always keeps required fields regardless of optional content", () => {
    const result = buildManualPaymentInput({
      packageId: "pkg-2",
      paymentMethodId: "method-2",
      submittedTxRef: "",
      senderPhone: "",
      senderName: "",
      notes: "",
    });
    expect(result.packageId).toBe("pkg-2");
    expect(result.paymentMethodId).toBe("method-2");
  });
});
