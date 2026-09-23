import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let listUsageLogs: typeof import("./admin-logs.service").listUsageLogs;
let listAuditLogs: typeof import("./admin-logs.service").listAuditLogs;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ listUsageLogs, listAuditLogs } = await import("./admin-logs.service"));
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

async function insertUsage(
  userId: string,
  overrides: Partial<{ amount: number; modelId: string; createdAt: Date }> = {}
) {
  return db.insert(schema.transactions).values({
    userId,
    type:         "usage_debit",
    amount:       overrides.amount ?? -25_000_000,
    balanceAfter: 0,
    modelId:      overrides.modelId ?? "gpt-4o",
    inputTokens:  1000,
    outputTokens: 500,
    requestId:    randomUUID(),
    createdAt:    overrides.createdAt ?? new Date(),
  }).returning({ id: schema.transactions.id });
}

async function insertAudit(
  adminId: string,
  overrides: Partial<{ action: string; targetType: string; targetId: string; createdAt: Date }> = {}
) {
  return db.insert(schema.auditLogs).values({
    adminId,
    action:     overrides.action ?? "user.suspended",
    targetType: overrides.targetType ?? "user",
    targetId:   overrides.targetId ?? randomUUID(),
    after:      { note: "test" },
    createdAt:  overrides.createdAt ?? new Date(),
  }).returning({ id: schema.auditLogs.id });
}

describe("admin-logs.service — listUsageLogs is admin-wide, not user-scoped", () => {
  it("a single call surfaces rows belonging to two different users", async () => {
    const { userId: userA } = await createTestUser(db, schema);
    const { userId: userB } = await createTestUser(db, schema);
    await insertUsage(userA);
    await insertUsage(userB);

    const result = await listUsageLogs({ limit: 50 });
    const userIds = new Set(result.items.map((i) => i.userId));

    expect(userIds.has(userA)).toBe(true);
    expect(userIds.has(userB)).toBe(true);
  });

  it("userId filter narrows to just that user", async () => {
    const { userId: userA } = await createTestUser(db, schema);
    const { userId: userB } = await createTestUser(db, schema);
    await insertUsage(userA);
    await insertUsage(userB);

    const result = await listUsageLogs({ limit: 50, userId: userA });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.userId).toBe(userA);
  });

  it("modelId filter narrows correctly", async () => {
    const { userId } = await createTestUser(db, schema);
    await insertUsage(userId, { modelId: "gpt-4o" });
    await insertUsage(userId, { modelId: "claude-sonnet" });

    const result = await listUsageLogs({ limit: 50, modelId: "claude-sonnet" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.modelId).toBe("claude-sonnet");
  });

  it("excludes non-usage_debit transactions", async () => {
    const { userId } = await createTestUser(db, schema);
    await insertUsage(userId);
    await db.insert(schema.transactions).values({
      userId, type: "redeem", amount: 50_000_000, balanceAfter: 50_000_000,
    });

    const result = await listUsageLogs({ limit: 50 });

    expect(result.items).toHaveLength(1);
  });

  it("keyset cursor pagination returns every row exactly once, newest first", async () => {
    const { userId } = await createTestUser(db, schema);
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await insertUsage(userId, { createdAt: new Date(now - i * 1000) });
    }

    const page1 = await listUsageLogs({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listUsageLogs({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await listUsageLogs({ limit: 2, cursor: page2.nextCursor! });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const allIds = [...page1.items, ...page2.items, ...page3.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(5); // no duplicates, no gaps

    const createdAts = [...page1.items, ...page2.items, ...page3.items].map((i) => i.createdAt.getTime());
    expect(createdAts).toEqual([...createdAts].sort((a, b) => b - a)); // strictly newest-first
  });

  it("an unknown cursor is ignored rather than erroring", async () => {
    const { userId } = await createTestUser(db, schema);
    await insertUsage(userId);

    const result = await listUsageLogs({ limit: 50, cursor: randomUUID() });

    expect(result.items).toHaveLength(1);
  });
});

describe("admin-logs.service — listAuditLogs", () => {
  it("filters by adminId, action, and targetType independently", async () => {
    const { userId: adminA } = await createTestUser(db, schema);
    const { userId: adminB } = await createTestUser(db, schema);
    await insertAudit(adminA, { action: "user.suspended", targetType: "user" });
    await insertAudit(adminA, { action: "package.create", targetType: "package" });
    await insertAudit(adminB, { action: "user.suspended", targetType: "user" });

    const byAdmin = await listAuditLogs({ limit: 50, adminId: adminA });
    expect(byAdmin.items).toHaveLength(2);

    const byAction = await listAuditLogs({ limit: 50, action: "user.suspended" });
    expect(byAction.items).toHaveLength(2);

    const byTarget = await listAuditLogs({ limit: 50, targetType: "package" });
    expect(byTarget.items).toHaveLength(1);
  });

  it("keyset cursor pagination returns every row exactly once", async () => {
    const { userId: admin } = await createTestUser(db, schema);
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await insertAudit(admin, { createdAt: new Date(now - i * 1000) });
    }

    const page1 = await listAuditLogs({ limit: 2 });
    const page2 = await listAuditLogs({ limit: 2, cursor: page1.nextCursor! });
    const page3 = await listAuditLogs({ limit: 2, cursor: page2.nextCursor! });

    expect(page3.nextCursor).toBeNull();
    const allIds = [...page1.items, ...page2.items, ...page3.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(5);
  });

  it("range clamps to the last 90 days", async () => {
    const { userId: admin } = await createTestUser(db, schema);
    await insertAudit(admin, { createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) }); // outside
    await insertAudit(admin, { createdAt: new Date() }); // inside

    const result = await listAuditLogs({ limit: 50 });

    expect(result.items).toHaveLength(1);
  });
});
