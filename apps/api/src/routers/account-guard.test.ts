/**
 * P1.1 — account guard + admin protections, exercised end-to-end through the
 * REAL appRouter against a real Postgres (Testcontainers).
 *
 * "Next.js caller" note: apps/web/server/context.ts builds `{ db, user, ip }`
 * where `user` is the FULL users row re-read from the DB on every request.
 * `callerFor()` below builds the identical shape and runs it through
 * `createCallerFactory(appRouter)` — the same factory the web app uses in
 * apps/web/lib/trpc-server.ts. Because the guard lives in the procedures (not
 * in either entry point), passing the same context shape proves both entry
 * points are covered. What this does NOT execute is better-auth's own
 * `auth.api.getSession` (it needs the web runtime); see docs/PR_NOTES.md.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser, createTestSession } from "../test/factories";

// The router graph pulls in modules that read the Zod-validated ./config
// (which calls process.exit on missing env). None of them is exercised by
// the guard; stub them out.
vi.mock("../config", () => ({
  config: {
    GATEWAY_URL: "http://mock-gateway.test", GATEWAY_MASTER_KEY: "mock-key-0123456789",
    GATEWAY_ROOT_TOKEN: "mock-root-0123456789", REDIS_URL: "redis://localhost:1/0",
    FRONTEND_URL: "http://localhost:3000", SUMMARIZATION_MODEL: "gpt-4o-mini",
    RESEND_API_KEY: "x", RESEND_FROM_EMAIL: "a@example.com", RESEND_FROM_NAME: "t",
  },
}));
vi.mock("../services/gateway-channels.service", () => ({ fetchGatewayChannels: vi.fn() }));
vi.mock("../services/model-sync.service", () => ({ syncModelsFromGateway: vi.fn() }));

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let appRouter: typeof import("./index").appRouter;
let createCallerFactory: typeof import("./index").createCallerFactory;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ appRouter, createCallerFactory } = await import("./index"));
}, 60_000);

afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await resetTestDb(); });

/** Same shape as apps/web/server/context.ts: full row re-read from the DB. */
async function callerFor(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return createCallerFactory(appRouter)({ db, user: user ?? null, ip: "203.0.113.9" } as any);
}

const sessionCount = async (userId: string) =>
  (await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId))).length;
const statusOf = async (userId: string) =>
  (await db.query.users.findFirst({ where: eq(schema.users.id, userId) }))!.status;

const manualPaymentInput = () => ({ packageId: randomUUID(), paymentMethodId: randomUUID() });

describe("protectedProcedure — locked accounts are refused (G2)", () => {
  // RED on the old code: these procedures had no status/flag check and succeeded.
  it("a FRAUD-FLAGGED user cannot redeemCode, generateApiKey or submitManualPayment", async () => {
    const { userId } = await createTestUser(db, schema, { isFraudFlagged: true });
    const api = await callerFor(userId);
    const expected = { code: "FORBIDDEN", message: "ACCOUNT_UNDER_REVIEW" };
    await expect(api.billing.redeemCode({ code: "AAAA-BBBB-CCCC-DDDD" })).rejects.toMatchObject(expected);
    await expect(api.user.generateApiKey()).rejects.toMatchObject(expected);
    await expect(api.billing.submitManualPayment(manualPaymentInput())).rejects.toMatchObject(expected);
  });

  it("a SUSPENDED user is refused with ACCOUNT_SUSPENDED", async () => {
    const { userId } = await createTestUser(db, schema, { status: "suspended" });
    const api = await callerFor(userId);
    await expect(api.user.generateApiKey())
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "ACCOUNT_SUSPENDED" });
    // the key must not have been written
    const row = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    expect(row?.apiKeyHash).toBeNull();
  });

  it("an ACTIVE user still gets through the guard (generateApiKey succeeds)", async () => {
    const { userId } = await createTestUser(db, schema);
    const api = await callerFor(userId);
    await expect(api.user.generateApiKey()).resolves.toBeDefined();
  });

  it("no user at all is still UNAUTHORIZED, not FORBIDDEN", async () => {
    const api = createCallerFactory(appRouter)({ db, user: null, ip: "x" } as any);
    await expect(api.user.generateApiKey()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("adminProcedure — locked admins are refused", () => {
  it("a suspended admin cannot call an admin procedure", async () => {
    const { userId } = await createTestUser(db, schema, { role: "admin", status: "suspended" });
    const api = await callerFor(userId);
    await expect(api.admin.getDashboardStats())
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "ACCOUNT_SUSPENDED" });
  });

  it("a fraud-flagged superadmin cannot call an admin procedure", async () => {
    const { userId } = await createTestUser(db, schema, { role: "superadmin", isFraudFlagged: true });
    const api = await callerFor(userId);
    await expect(api.admin.updateUserStatus({ userId: randomUUID(), status: "suspended" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "ACCOUNT_UNDER_REVIEW" });
  });

  it("a plain user still gets a bare FORBIDDEN (no account-state hint) on admin endpoints", async () => {
    const { userId } = await createTestUser(db, schema, { status: "suspended" });
    const api = await callerFor(userId);
    const err = await api.admin.updateUserStatus({ userId: randomUUID(), status: "suspended" }).catch((e) => e);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).not.toMatch(/ACCOUNT_/);
  });
});

describe("admin.updateUserStatus — protections (G2b)", () => {
  // RED on the old code: sessions survived a suspension.
  it("suspending a user deletes all of their sessions and flips status", async () => {
    const admin  = await createTestUser(db, schema, { role: "admin" });
    const target = await createTestUser(db, schema);
    await createTestSession(db, schema, target.userId);
    await createTestSession(db, schema, target.userId);
    const other = await createTestUser(db, schema);
    await createTestSession(db, schema, other.userId);

    const api = await callerFor(admin.userId);
    await api.admin.updateUserStatus({ userId: target.userId, status: "suspended", reason: "abuse" });

    expect(await statusOf(target.userId)).toBe("suspended");
    expect(await sessionCount(target.userId)).toBe(0);
    expect(await sessionCount(other.userId)).toBe(1); // untouched
  });

  it("after suspension the target is locked out through the tRPC guard too", async () => {
    const admin  = await createTestUser(db, schema, { role: "admin" });
    const target = await createTestUser(db, schema);
    await (await callerFor(admin.userId)).admin.updateUserStatus({ userId: target.userId, status: "suspended" });
    await expect((await callerFor(target.userId)).user.generateApiKey())
      .rejects.toMatchObject({ message: "ACCOUNT_SUSPENDED" });
  });

  // RED on the old code: an admin could suspend themselves.
  it("an admin cannot suspend or reactivate themselves", async () => {
    const admin = await createTestUser(db, schema, { role: "admin" });
    await createTestSession(db, schema, admin.userId);
    const api = await callerFor(admin.userId);
    await expect(api.admin.updateUserStatus({ userId: admin.userId, status: "suspended" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "CANNOT_MODIFY_SELF" });
    expect(await statusOf(admin.userId)).toBe("active");
    expect(await sessionCount(admin.userId)).toBe(1);
  });

  // RED on the old code: any admin could suspend a superadmin.
  it("a plain admin cannot suspend a superadmin or another admin", async () => {
    const admin = await createTestUser(db, schema, { role: "admin" });
    const sup   = await createTestUser(db, schema, { role: "superadmin" });
    const peer  = await createTestUser(db, schema, { role: "admin" });
    await createTestSession(db, schema, sup.userId);
    const api = await callerFor(admin.userId);
    for (const t of [sup.userId, peer.userId]) {
      await expect(api.admin.updateUserStatus({ userId: t, status: "suspended" }))
        .rejects.toMatchObject({ code: "FORBIDDEN", message: "INSUFFICIENT_ROLE_FOR_TARGET" });
      expect(await statusOf(t)).toBe("active");
    }
    expect(await sessionCount(sup.userId)).toBe(1);
  });

  it("a superadmin can suspend an admin", async () => {
    const sup   = await createTestUser(db, schema, { role: "superadmin" });
    const admin = await createTestUser(db, schema, { role: "admin" });
    await (await callerFor(sup.userId)).admin.updateUserStatus({ userId: admin.userId, status: "suspended" });
    expect(await statusOf(admin.userId)).toBe("suspended");
  });

  it("an admin can reactivate a plain user; reactivation does not error", async () => {
    const admin  = await createTestUser(db, schema, { role: "admin" });
    const target = await createTestUser(db, schema, { status: "suspended" });
    await (await callerFor(admin.userId)).admin.updateUserStatus({ userId: target.userId, status: "active" });
    expect(await statusOf(target.userId)).toBe("active");
  });

  it("an unknown user id is NOT_FOUND and writes no audit row", async () => {
    const admin = await createTestUser(db, schema, { role: "admin" });
    const api = await callerFor(admin.userId);
    await expect(api.admin.updateUserStatus({ userId: randomUUID(), status: "suspended" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(schema.auditLogs)).toHaveLength(0);
  });

  it("writes an audit row with before/after and the revoked-session count", async () => {
    const admin  = await createTestUser(db, schema, { role: "admin" });
    const target = await createTestUser(db, schema);
    await createTestSession(db, schema, target.userId);
    await (await callerFor(admin.userId)).admin.updateUserStatus({ userId: target.userId, status: "suspended", reason: "chargeback" });
    const [row] = await db.select().from(schema.auditLogs);
    expect(row).toMatchObject({ adminId: admin.userId, action: "user.suspended", targetId: target.userId });
    expect(row!.before).toEqual({ status: "active" });
    expect(row!.after).toMatchObject({ status: "suspended", reason: "chargeback", sessionsRevoked: 1 });
  });

  it("a rejected call changes nothing (transaction rolls back)", async () => {
    const admin = await createTestUser(db, schema, { role: "admin" });
    const sup   = await createTestUser(db, schema, { role: "superadmin" });
    await createTestSession(db, schema, sup.userId);
    await (await callerFor(admin.userId)).admin
      .updateUserStatus({ userId: sup.userId, status: "suspended" }).catch(() => {});
    expect(await db.select().from(schema.auditLogs)).toHaveLength(0);
    expect(await sessionCount(sup.userId)).toBe(1);
  });
});

describe("migration 0018 trigger — DB-level backstop for writers outside apps/api", () => {
  // Simulates the frozen apps/web PATCH /api/admin/users/[id] route, which
  // updates users.status with a bare UPDATE and revokes nothing itself.
  it("a raw status update to 'suspended' deletes that user's sessions only", async () => {
    const a = await createTestUser(db, schema);
    const b = await createTestUser(db, schema);
    await createTestSession(db, schema, a.userId);
    await createTestSession(db, schema, b.userId);
    await db.update(schema.users).set({ status: "suspended" }).where(eq(schema.users.id, a.userId));
    expect(await sessionCount(a.userId)).toBe(0);
    expect(await sessionCount(b.userId)).toBe(1);
  });

  it("flagging a user as fraud deletes their sessions", async () => {
    const a = await createTestUser(db, schema);
    await createTestSession(db, schema, a.userId);
    await db.update(schema.users).set({ isFraudFlagged: true }).where(eq(schema.users.id, a.userId));
    expect(await sessionCount(a.userId)).toBe(0);
  });

  it("unrelated updates and reactivation do NOT delete sessions", async () => {
    const a = await createTestUser(db, schema);
    await createTestSession(db, schema, a.userId);
    await db.update(schema.users).set({ lastSeenAt: new Date(), displayName: "x" }).where(eq(schema.users.id, a.userId));
    expect(await sessionCount(a.userId)).toBe(1);

    const s = await createTestUser(db, schema, { status: "suspended" });
    await createTestSession(db, schema, s.userId); // e.g. a fresh login by a suspended user
    await db.update(schema.users).set({ status: "active" }).where(eq(schema.users.id, s.userId));
    expect(await sessionCount(s.userId)).toBe(1);
  });

  it("re-writing 'suspended' onto an already-suspended user does not re-fire", async () => {
    const s = await createTestUser(db, schema, { status: "suspended" });
    await createTestSession(db, schema, s.userId);
    await db.update(schema.users).set({ status: "suspended" }).where(eq(schema.users.id, s.userId));
    expect(await sessionCount(s.userId)).toBe(1);
  });
});
