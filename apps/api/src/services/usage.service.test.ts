import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let getUsageSummary:    typeof import("./usage.service").getUsageSummary;
let getUsageTimeseries: typeof import("./usage.service").getUsageTimeseries;
let getUsageByModel:    typeof import("./usage.service").getUsageByModel;
let listUsage:           typeof import("./usage.service").listUsage;
let listUsageForExport:  typeof import("./usage.service").listUsageForExport;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ getUsageSummary, getUsageTimeseries, getUsageByModel, listUsage, listUsageForExport } =
    await import("./usage.service"));
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

/** Insert a `usage_debit` transaction directly — the only type usage.service.ts reads. */
async function insertUsage(
  userId: string,
  overrides: Partial<{
    amount: number; modelId: string; inputTokens: number; outputTokens: number; createdAt: Date;
  }> = {}
) {
  await db.insert(schema.transactions).values({
    userId,
    type:         "usage_debit",
    amount:       overrides.amount ?? -25_000_000, // debit: negative
    balanceAfter: 0,
    modelId:      overrides.modelId ?? "gpt-4o",
    inputTokens:  overrides.inputTokens ?? 1000,
    outputTokens: overrides.outputTokens ?? 500,
    requestId:    randomUUID(),
    createdAt:    overrides.createdAt ?? new Date(),
  });
}

/** A non-usage transaction (e.g. a redeem) — must never leak into any usage.* result. */
async function insertRedeem(userId: string, amount = 50_000_000) {
  await db.insert(schema.transactions).values({
    userId, type: "redeem", amount, balanceAfter: amount,
  });
}

describe("usage.service — IDOR: results are always scoped to the requesting user", () => {
  it("getUsageSummary never includes another user's spend", async () => {
    const { userId: userA } = await createTestUser(db, schema);
    const { userId: userB } = await createTestUser(db, schema);

    await insertUsage(userA, { amount: -10_000_000 });
    await insertUsage(userB, { amount: -999_000_000 }); // huge — would dominate a leaky query

    const summaryA = await getUsageSummary(userA);
    expect(summaryA.totalSpentMicroCredits).toBe(10_000_000);
    expect(summaryA.requestCount).toBe(1);

    const summaryB = await getUsageSummary(userB);
    expect(summaryB.totalSpentMicroCredits).toBe(999_000_000);
  });

  it("getUsageTimeseries and getUsageByModel never include another user's rows", async () => {
    const { userId: userA } = await createTestUser(db, schema);
    const { userId: userB } = await createTestUser(db, schema);

    await insertUsage(userA, { modelId: "gpt-4o" });
    await insertUsage(userB, { modelId: "claude-opus" });

    const seriesA = await getUsageTimeseries(userA);
    expect(seriesA.reduce((n, p) => n + p.requestCount, 0)).toBe(1);

    const byModelA = await getUsageByModel(userA);
    expect(byModelA).toHaveLength(1);
    expect(byModelA[0]!.modelId).toBe("gpt-4o");
  });

  it("listUsage never returns another user's transactions, even via a foreign cursor", async () => {
    const { userId: userA } = await createTestUser(db, schema);
    const { userId: userB } = await createTestUser(db, schema);

    await insertUsage(userA);
    await insertUsage(userB);
    const [bTx] = await db.query.transactions.findMany({
      where: (t, { eq }) => eq(t.userId, userB),
    });

    const resultA = await listUsage(userA, { limit: 20 });
    expect(resultA.items).toHaveLength(1);
    expect(resultA.items.every((i) => i.id !== bTx!.id)).toBe(true);

    // Attempting to page using user B's own transaction id as a cursor,
    // while authenticated as user A, must not error AND must not leak —
    // the cursor lookup itself is scoped to userId, so a foreign cursor
    // is treated as if it doesn't exist (empty next page), never as a
    // way to jump into another user's keyset.
    const resultWithForeignCursor = await listUsage(userA, { limit: 20, cursor: bTx!.id });
    expect(resultWithForeignCursor.items.every((i) => i.id !== bTx!.id)).toBe(true);
  });

  it("listUsageForExport never includes another user's rows", async () => {
    const { userId: userA } = await createTestUser(db, schema);
    const { userId: userB } = await createTestUser(db, schema);
    await insertUsage(userA);
    await insertUsage(userB);

    const rows = await listUsageForExport(userA, {});
    expect(rows).toHaveLength(1);
  });
});

describe("usage.service — non-usage transactions are excluded", () => {
  it("redeem/admin/refund rows never appear in usage results", async () => {
    const { userId } = await createTestUser(db, schema);
    await insertUsage(userId, { amount: -5_000_000 });
    await insertRedeem(userId);

    const summary = await getUsageSummary(userId);
    expect(summary.requestCount).toBe(1);
    expect(summary.totalSpentMicroCredits).toBe(5_000_000);
  });
});

describe("usage.service — aggregation correctness", () => {
  it("getUsageSummary computes avg cost and top model correctly", async () => {
    const { userId } = await createTestUser(db, schema);
    await insertUsage(userId, { amount: -10_000_000, modelId: "gpt-4o" });
    await insertUsage(userId, { amount: -10_000_000, modelId: "gpt-4o" });
    await insertUsage(userId, { amount: -5_000_000, modelId: "claude-opus" });

    const summary = await getUsageSummary(userId);
    expect(summary.requestCount).toBe(3);
    expect(summary.totalSpentMicroCredits).toBe(25_000_000);
    expect(summary.avgCostMicroCredits).toBe(Math.round(25_000_000 / 3));
    expect(summary.topModelId).toBe("gpt-4o");
  });

  it("listUsage paginates with a stable keyset cursor (no skips/dupes across pages)", async () => {
    const { userId } = await createTestUser(db, schema);
    for (let i = 0; i < 5; i++) {
      await insertUsage(userId, { createdAt: new Date(Date.now() - i * 1000) });
    }

    const page1 = await listUsage(userId, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listUsage(userId, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(2);
    const ids1 = page1.items.map((i) => i.id);
    const ids2 = page2.items.map((i) => i.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it("range filter (from/to) excludes rows outside the window", async () => {
    const { userId } = await createTestUser(db, schema);
    const now = new Date();
    const old = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000); // > 90d clamp
    await insertUsage(userId, { createdAt: now });
    await insertUsage(userId, { createdAt: old });

    // No explicit range → service clamps to the last 90 days, so the
    // 200-day-old row must not be counted.
    const summary = await getUsageSummary(userId);
    expect(summary.requestCount).toBe(1);
  });
});
