import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let submitManualPayment:  typeof import("./manual-payment.service").submitManualPayment;
let approveManualPayment: typeof import("./manual-payment.service").approveManualPayment;
let rejectManualPayment:  typeof import("./manual-payment.service").rejectManualPayment;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ submitManualPayment, approveManualPayment, rejectManualPayment } = await import("./manual-payment.service"));
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

async function insertPackage(overrides: Partial<{ credits: number; isActive: boolean }> = {}) {
  const [row] = await db.insert(schema.creditPackages).values({
    name: "Test Package", nameAr: "باقة تجريبية",
    priceYer: 1000, priceUsdEquivalent: "1.70",
    credits: overrides.credits ?? 300_000_000,
    isActive: overrides.isActive ?? true,
  }).returning();
  return row!;
}

async function insertMethod(overrides: Partial<{ type: "jaib_voucher" | "manual_transfer"; isActive: boolean }> = {}) {
  const [row] = await db.insert(schema.paymentMethods).values({
    name: "Manual Wallet Transfer", nameAr: "تحويل محفظة يدوي",
    type: overrides.type ?? "manual_transfer",
    isActive: overrides.isActive ?? true,
  }).returning();
  return row!;
}

describe("submitManualPayment", () => {
  it("rejects an unknown package", async () => {
    const { userId } = await createTestUser(db, schema);
    const method = await insertMethod();
    const result = await submitManualPayment(userId, { packageId: randomUUID(), paymentMethodId: method.id });
    expect(result.success).toBe(false);
    expect(result.error).toBe("PACKAGE_NOT_FOUND");
  });

  it("rejects an inactive package", async () => {
    const { userId } = await createTestUser(db, schema);
    const pkg    = await insertPackage({ isActive: false });
    const method = await insertMethod();
    const result = await submitManualPayment(userId, { packageId: pkg.id, paymentMethodId: method.id });
    expect(result.success).toBe(false);
    expect(result.error).toBe("PACKAGE_NOT_FOUND");
  });

  it("rejects a jaib_voucher method (claims are manual-transfer only)", async () => {
    const { userId } = await createTestUser(db, schema);
    const pkg    = await insertPackage();
    const method = await insertMethod({ type: "jaib_voucher" });
    const result = await submitManualPayment(userId, { packageId: pkg.id, paymentMethodId: method.id });
    expect(result.success).toBe(false);
    expect(result.error).toBe("PAYMENT_METHOD_INACTIVE");
  });

  it("rejects a deactivated manual_transfer method", async () => {
    const { userId } = await createTestUser(db, schema);
    const pkg    = await insertPackage();
    const method = await insertMethod({ isActive: false });
    const result = await submitManualPayment(userId, { packageId: pkg.id, paymentMethodId: method.id });
    expect(result.success).toBe(false);
    expect(result.error).toBe("PAYMENT_METHOD_INACTIVE");
  });

  it("happy path: creates a pending claim with a unique reference code, grants nothing yet", async () => {
    const { userId } = await createTestUser(db, schema);
    const pkg    = await insertPackage();
    const method = await insertMethod();

    const result = await submitManualPayment(userId, {
      packageId: pkg.id, paymentMethodId: method.id,
      submittedTxRef: "TX123", senderPhone: "7xxxxxxxx",
    });

    expect(result.success).toBe(true);
    expect(result.referenceCode).toMatch(/^REF-/);

    const claim = await db.query.pendingManualPayments.findFirst({
      where: (c: any, { eq }: any) => eq(c.id, result.claimId!),
    });
    expect(claim?.status).toBe("pending");
    expect(claim?.submittedTxRef).toBe("TX123");

    const balance = await db.query.balances.findFirst({
      where: (b: any, { eq }: any) => eq(b.userId, userId),
    });
    expect(balance?.credits).toBe(0); // not credited until admin approval
  });
});

describe("approveManualPayment", () => {
  it("credits the buyer's balance, marks approved, and links the granted transaction", async () => {
    const { userId }  = await createTestUser(db, schema);
    const { userId: adminId } = await createTestUser(db, schema, { email: "admin@example.com" });
    const pkg    = await insertPackage({ credits: 300_000_000 });
    const method = await insertMethod();
    const submitted = await submitManualPayment(userId, { packageId: pkg.id, paymentMethodId: method.id });

    const result = await approveManualPayment(submitted.claimId!, adminId);
    expect(result.success).toBe(true);

    const balance = await db.query.balances.findFirst({
      where: (b: any, { eq }: any) => eq(b.userId, userId),
    });
    expect(balance?.credits).toBe(300_000_000);

    const claim = await db.query.pendingManualPayments.findFirst({
      where: (c: any, { eq }: any) => eq(c.id, submitted.claimId!),
    });
    expect(claim?.status).toBe("approved");
    expect(claim?.reviewedByAdminId).toBe(adminId);
    expect(claim?.grantedTransactionId).not.toBeNull();

    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, userId),
    });
    expect(txRows).toHaveLength(1);
    expect(txRows[0]!.type).toBe("payment");
    expect(txRows[0]!.paymentId).toBe(submitted.claimId);
  });

  it("does not touch redeem_codes at all — manual transfer credits directly (ADR-008)", async () => {
    const { userId }  = await createTestUser(db, schema);
    const { userId: adminId } = await createTestUser(db, schema, { email: "admin2@example.com" });
    const pkg    = await insertPackage();
    const method = await insertMethod();
    const submitted = await submitManualPayment(userId, { packageId: pkg.id, paymentMethodId: method.id });

    await approveManualPayment(submitted.claimId!, adminId);

    const allCodes = await db.query.redeemCodes.findMany();
    expect(allCodes).toHaveLength(0);
  });

  it("rejects approving a claim twice — second call is a no-op, no double credit", async () => {
    const { userId }  = await createTestUser(db, schema);
    const { userId: adminId } = await createTestUser(db, schema, { email: "admin3@example.com" });
    const pkg    = await insertPackage({ credits: 300_000_000 });
    const method = await insertMethod();
    const submitted = await submitManualPayment(userId, { packageId: pkg.id, paymentMethodId: method.id });

    const first  = await approveManualPayment(submitted.claimId!, adminId);
    const second = await approveManualPayment(submitted.claimId!, adminId);

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);

    const balance = await db.query.balances.findFirst({
      where: (b: any, { eq }: any) => eq(b.userId, userId),
    });
    expect(balance?.credits).toBe(300_000_000); // not 600M
  });

  it(
    "under concurrent approval of the SAME claim by two admins, exactly one " +
      "succeeds and the buyer is credited exactly once — the pending→approved " +
      "status flip is the atomic claim, mirroring redeemCode()'s guarantee",
    async () => {
      const { userId }  = await createTestUser(db, schema);
      const { userId: admin1 } = await createTestUser(db, schema, { email: "race-admin1@example.com" });
      const { userId: admin2 } = await createTestUser(db, schema, { email: "race-admin2@example.com" });
      const pkg    = await insertPackage({ credits: 300_000_000 });
      const method = await insertMethod();
      const submitted = await submitManualPayment(userId, { packageId: pkg.id, paymentMethodId: method.id });

      const [r1, r2] = await Promise.all([
        approveManualPayment(submitted.claimId!, admin1),
        approveManualPayment(submitted.claimId!, admin2),
      ]);

      const successes = [r1, r2].filter((r) => r.success);
      expect(successes).toHaveLength(1);

      const balance = await db.query.balances.findFirst({
        where: (b: any, { eq }: any) => eq(b.userId, userId),
      });
      expect(balance?.credits).toBe(300_000_000);

      const txRows = await db.query.transactions.findMany({
        where: (t: any, { eq }: any) => eq(t.userId, userId),
      });
      expect(txRows).toHaveLength(1);
    }
  );

  it("returns failure for a nonexistent claim", async () => {
    const { userId: adminId } = await createTestUser(db, schema, { email: "admin4@example.com" });
    const result = await approveManualPayment(randomUUID(), adminId);
    expect(result.success).toBe(false);
  });
});

describe("rejectManualPayment", () => {
  it("marks the claim rejected with a reason and grants no credits", async () => {
    const { userId }  = await createTestUser(db, schema);
    const { userId: adminId } = await createTestUser(db, schema, { email: "admin5@example.com" });
    const pkg    = await insertPackage();
    const method = await insertMethod();
    const submitted = await submitManualPayment(userId, { packageId: pkg.id, paymentMethodId: method.id });

    const result = await rejectManualPayment(submitted.claimId!, adminId, "No matching transfer found");
    expect(result.success).toBe(true);

    const claim = await db.query.pendingManualPayments.findFirst({
      where: (c: any, { eq }: any) => eq(c.id, submitted.claimId!),
    });
    expect(claim?.status).toBe("rejected");
    expect(claim?.rejectionReason).toBe("No matching transfer found");

    const balance = await db.query.balances.findFirst({
      where: (b: any, { eq }: any) => eq(b.userId, userId),
    });
    expect(balance?.credits).toBe(0);
  });

  it("cannot reject an already-approved claim", async () => {
    const { userId }  = await createTestUser(db, schema);
    const { userId: adminId } = await createTestUser(db, schema, { email: "admin6@example.com" });
    const pkg    = await insertPackage();
    const method = await insertMethod();
    const submitted = await submitManualPayment(userId, { packageId: pkg.id, paymentMethodId: method.id });

    await approveManualPayment(submitted.claimId!, adminId);
    const result = await rejectManualPayment(submitted.claimId!, adminId, "too late");
    expect(result.success).toBe(false);
  });
});
