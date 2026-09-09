import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

// See testDb.ts for why these MUST be dynamic imports resolved inside
// beforeAll, after the test container's DATABASE_URL is set — a static
// import here would evaluate "@ai-platform/db" too early and throw.
let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let deductCreditsAtomic: typeof import("./balance.service").deductCreditsAtomic;
let creditBalance: typeof import("./balance.service").creditBalance;
let getBalance: typeof import("./balance.service").getBalance;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ deductCreditsAtomic, creditBalance, getBalance } = await import("./balance.service"));
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

const USAGE_META = { modelId: "gpt-4o", inputTokens: 100, outputTokens: 50, requestId: "req-1" };

describe("deductCreditsAtomic", () => {
  it("deducts credits and records a transaction row on success", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 100_000_000 });

    const result = await deductCreditsAtomic(userId, 25_000_000, "Chat usage", USAGE_META);

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(75_000_000);

    const balance = await getBalance(userId);
    expect(balance.credits).toBe(75_000_000);

    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, userId),
    });
    expect(txRows).toHaveLength(1);
    expect(txRows[0].type).toBe("usage_debit");
    expect(txRows[0].amount).toBe(-25_000_000);
    expect(txRows[0].balanceAfter).toBe(75_000_000);
  });

  it("fails cleanly (no exception) when balance is insufficient, and never goes negative", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 10_000_000 });

    const result = await deductCreditsAtomic(userId, 25_000_000, "Chat usage", USAGE_META);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("INSUFFICIENT_BALANCE");

    // Balance must be untouched, and no transaction row should exist.
    const balance = await getBalance(userId);
    expect(balance.credits).toBe(10_000_000);
    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, userId),
    });
    expect(txRows).toHaveLength(0);
  });

  it("rejects a non-positive amount rather than silently crediting the user", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 10_000_000 });
    await expect(deductCreditsAtomic(userId, 0, "bad", USAGE_META)).rejects.toThrow();
    await expect(deductCreditsAtomic(userId, -5, "bad", USAGE_META)).rejects.toThrow();
  });

  it(
    "under concurrent deductions, only as many succeed as the balance allows — " +
      "balance never goes negative (the core theft-vector this function exists to prevent)",
    async () => {
      const { userId } = await createTestUser(db, schema, { initialMicroCredits: 100_000_000 }); // 100 credits

      const DEDUCTION = 30_000_000; // 30 credits each
      const CONCURRENT_REQUESTS = 10; // demand = 300 credits against 100 available

      const results = await Promise.all(
        Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
          deductCreditsAtomic(userId, DEDUCTION, "Chat usage", { ...USAGE_META, requestId: `req-${i}` })
        )
      );

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      // floor(100 / 30) = 3 can succeed; the 4th would need 10 more than remains.
      expect(successes).toHaveLength(3);
      expect(failures).toHaveLength(7);
      failures.forEach((f) => expect(f.reason).toBe("INSUFFICIENT_BALANCE"));

      const finalBalance = await getBalance(userId);
      expect(finalBalance.credits).toBe(10_000_000); // 100 - 3*30 = 10
      expect(finalBalance.credits).toBeGreaterThanOrEqual(0); // DB CHECK constraint backstop

      // Exactly one transaction row per SUCCESSFUL deduction — no double billing,
      // no phantom rows from the failed attempts.
      const txRows = await db.query.transactions.findMany({
        where: (t: any, { eq }: any) => eq(t.userId, userId),
      });
      expect(txRows).toHaveLength(3);
    }
  );

  it("supports an injected `tx` executor so callers can nest this inside their own transaction", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 50_000_000 });

    const result = await db.transaction(async (tx: any) => {
      return await deductCreditsAtomic(userId, 20_000_000, "nested", USAGE_META, tx);
    });

    expect(result.success).toBe(true);
    const balance = await getBalance(userId);
    expect(balance.credits).toBe(30_000_000);
  });

  it("labels admin-initiated debits distinctly from ordinary usage debits", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 50_000_000 });

    await deductCreditsAtomic(userId, 10_000_000, "manual adjustment", {}, db, "admin_debit");

    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, userId),
    });
    expect(txRows[0].type).toBe("admin_debit");
  });
});

describe("creditBalance", () => {
  it("adds credits and records a transaction row", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 5_000_000 });

    await creditBalance(userId, 20_000_000, "redeem", { description: "test redeem" });

    const balance = await getBalance(userId);
    expect(balance.credits).toBe(25_000_000);
    expect(balance.totalRedeemed).toBe(20_000_000);

    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, userId),
    });
    expect(txRows).toHaveLength(1);
    expect(txRows[0].type).toBe("redeem");
    expect(txRows[0].amount).toBe(20_000_000);
  });

  it("throws if the user has no balance row (fail loud, not silent)", async () => {
    await expect(
      creditBalance("00000000-0000-0000-0000-000000000000", 1_000_000, "redeem", {})
    ).rejects.toThrow();
  });

  it("when nested via an injected tx, rolls back together with the outer transaction", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 0 });

    // Simulate an outer transaction (like redeemCode) that credits the
    // balance via the passed-in `tx`, then fails for an unrelated reason.
    // The credit must NOT survive if the outer transaction rolls back —
    // this is exactly the bug that existed before creditBalance() accepted
    // an executor: it used to open its OWN independent transaction, so a
    // failure here would have left the user with free credits.
    await expect(
      db.transaction(async (tx: any) => {
        await creditBalance(userId, 50_000_000, "redeem", { description: "should not stick" }, tx);
        throw new Error("simulated failure after credit, before commit");
      })
    ).rejects.toThrow("simulated failure");

    const balance = await getBalance(userId);
    expect(balance.credits).toBe(0);
    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, userId),
    });
    expect(txRows).toHaveLength(0);
  });
});
