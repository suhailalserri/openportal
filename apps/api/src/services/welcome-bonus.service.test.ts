import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let svc: typeof import("./welcome-bonus.service");
// Pure helpers, assigned in beforeAll from the dynamic import. A static import
// of the service would load @ai-platform/db before startTestDb() sets
// DATABASE_URL (see test/testDb.ts) and every test would ECONNREFUSED.
let ineligibilityReason: typeof import("./welcome-bonus.service").ineligibilityReason;
let isBonusActive: typeof import("./welcome-bonus.service").isBonusActive;

const CREDITS = 50 * 1_000_000;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  svc = await import("./welcome-bonus.service");
  ({ ineligibilityReason, isBonusActive } = svc);
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

async function makeAdmin(): Promise<string> {
  const { userId } = await createTestUser(db, schema);
  return userId;
}

async function enable(adminId: string, amount = CREDITS) {
  await svc.updateWelcomeBonusConfig({ enabled: true, amountMicroCredits: amount, adminId });
}

/** A user whose account is unambiguously newer than the launch stamp. */
async function newUser() {
  const { userId } = await createTestUser(db, schema);
  await db.update(schema.users)
    .set({ createdAt: new Date(Date.now() + 60_000) })
    .where(eq(schema.users.id, userId));
  return userId;
}

async function credits(userId: string) {
  const row = await db.query.balances.findFirst({ where: eq(schema.balances.userId, userId) });
  return row?.credits ?? 0;
}

async function bonusTxCount(userId: string) {
  const rows = await db.query.transactions.findMany({ where: eq(schema.transactions.userId, userId) });
  return rows.filter((r) => r.type === "welcome_bonus").length;
}

describe("ineligibilityReason (pure)", () => {
  const cfg = { enabled: true, amountMicroCredits: CREDITS, launchedAt: new Date("2026-01-01") };
  const ok = {
    status: "active" as const, isFraudFlagged: false,
    createdAt: new Date("2026-02-01"), welcomeBonusClaimedAt: null,
  };

  it("null when everything lines up", () => expect(ineligibilityReason(cfg, ok)).toBeNull());
  it("DISABLED when off or zero amount", () => {
    expect(ineligibilityReason({ ...cfg, enabled: false }, ok)).toBe("DISABLED");
    expect(ineligibilityReason({ ...cfg, amountMicroCredits: 0 }, ok)).toBe("DISABLED");
    expect(isBonusActive({ ...cfg, amountMicroCredits: 0 })).toBe(false);
  });
  it("ALREADY_CLAIMED wins over other reasons", () => {
    expect(ineligibilityReason(cfg, { ...ok, welcomeBonusClaimedAt: new Date(), status: "suspended" }))
      .toBe("ALREADY_CLAIMED");
  });
  it("ACCOUNT_RESTRICTED for suspended, unverified or fraud-flagged", () => {
    expect(ineligibilityReason(cfg, { ...ok, status: "suspended" })).toBe("ACCOUNT_RESTRICTED");
    expect(ineligibilityReason(cfg, { ...ok, status: "pending_verification" })).toBe("ACCOUNT_RESTRICTED");
    expect(ineligibilityReason(cfg, { ...ok, isFraudFlagged: true })).toBe("ACCOUNT_RESTRICTED");
  });
  it("NOT_ELIGIBLE for accounts older than the launch stamp", () => {
    expect(ineligibilityReason(cfg, { ...ok, createdAt: new Date("2025-12-31") })).toBe("NOT_ELIGIBLE");
  });
});

describe("claimWelcomeBonus", () => {
  it("credits the configured amount and records a welcome_bonus transaction", async () => {
    const admin = await makeAdmin();
    await enable(admin);
    const userId = await newUser();

    const res = await svc.claimWelcomeBonus(userId);

    expect(res.amountMicroCredits).toBe(CREDITS);
    expect(await credits(userId)).toBe(CREDITS);
    expect(await bonusTxCount(userId)).toBe(1);
    const status = await svc.getWelcomeBonusStatus(userId);
    expect(status).toMatchObject({ claimed: true, eligible: false });
  });

  it("second claim is rejected and pays nothing more", async () => {
    const admin = await makeAdmin();
    await enable(admin);
    const userId = await newUser();

    await svc.claimWelcomeBonus(userId);
    await expect(svc.claimWelcomeBonus(userId)).rejects.toMatchObject({ code: "ALREADY_CLAIMED" });

    expect(await credits(userId)).toBe(CREDITS);
    expect(await bonusTxCount(userId)).toBe(1);
  });

  it("10 concurrent claims (double click / many tabs) pay out exactly once", async () => {
    const admin = await makeAdmin();
    await enable(admin);
    const userId = await newUser();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => svc.claimWelcomeBonus(userId)),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await credits(userId)).toBe(CREDITS);
    expect(await bonusTxCount(userId)).toBe(1);
  });

  it("rejects when the feature is disabled", async () => {
    const userId = await newUser();
    await expect(svc.claimWelcomeBonus(userId)).rejects.toMatchObject({ code: "DISABLED" });
    expect(await credits(userId)).toBe(0);
  });

  it("existing accounts (created before the feature was first enabled) can't claim", async () => {
    const { userId } = await createTestUser(db, schema);
    await db.update(schema.users)
      .set({ createdAt: new Date(Date.now() - 24 * 3600_000) })
      .where(eq(schema.users.id, userId));

    const admin = await makeAdmin();
    await enable(admin);

    await expect(svc.claimWelcomeBonus(userId)).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    expect(await credits(userId)).toBe(0);
  });

  it("suspended or fraud-flagged users can't claim", async () => {
    const admin = await makeAdmin();
    await enable(admin);

    const suspended = await newUser();
    await db.update(schema.users).set({ status: "suspended" }).where(eq(schema.users.id, suspended));
    await expect(svc.claimWelcomeBonus(suspended)).rejects.toMatchObject({ code: "ACCOUNT_RESTRICTED" });

    const flagged = await newUser();
    await db.update(schema.users).set({ isFraudFlagged: true }).where(eq(schema.users.id, flagged));
    await expect(svc.claimWelcomeBonus(flagged)).rejects.toMatchObject({ code: "ACCOUNT_RESTRICTED" });
  });

  it("uses the amount at claim time (admin can change it before a user claims)", async () => {
    const admin = await makeAdmin();
    await enable(admin, 10 * 1_000_000);
    const userId = await newUser();
    await enable(admin, 25 * 1_000_000);

    await svc.claimWelcomeBonus(userId);
    expect(await credits(userId)).toBe(25 * 1_000_000);
  });
});

describe("updateWelcomeBonusConfig", () => {
  it("refuses to enable with a zero amount", async () => {
    const admin = await makeAdmin();
    await expect(svc.updateWelcomeBonusConfig({ enabled: true, amountMicroCredits: 0, adminId: admin }))
      .rejects.toThrow();
  });

  it("refuses negative or fractional micro-credit amounts", async () => {
    const admin = await makeAdmin();
    await expect(svc.updateWelcomeBonusConfig({ enabled: false, amountMicroCredits: -1, adminId: admin }))
      .rejects.toThrow();
    await expect(svc.updateWelcomeBonusConfig({ enabled: false, amountMicroCredits: 1.5, adminId: admin }))
      .rejects.toThrow();
  });

  it("stamps launchedAt once, on first enable, and never resets it", async () => {
    const admin = await makeAdmin();
    const first = await svc.updateWelcomeBonusConfig({ enabled: true, amountMicroCredits: CREDITS, adminId: admin });
    const stamp = first.after.launchedAt!;
    expect(stamp).toBeInstanceOf(Date);

    await svc.updateWelcomeBonusConfig({ enabled: false, amountMicroCredits: CREDITS, adminId: admin });
    const again = await svc.updateWelcomeBonusConfig({ enabled: true, amountMicroCredits: CREDITS, adminId: admin });
    expect(again.after.launchedAt!.getTime()).toBe(stamp.getTime());
  });

  it("admin view reports how many users have claimed", async () => {
    const admin = await makeAdmin();
    await enable(admin);
    const a = await newUser();
    const b = await newUser();
    await svc.claimWelcomeBonus(a);
    await svc.claimWelcomeBonus(b);
    const view = await svc.getWelcomeBonusAdminView();
    expect(view.claimedCount).toBe(2);
    expect(view.enabled).toBe(true);
  });
});

describe("checkWelcomeBonusForEmail", () => {
  it("reports USER_NOT_FOUND, NOT_ELIGIBLE (old account) and null (eligible)", async () => {
    const admin = await makeAdmin();
    await enable(admin);

    expect((await svc.checkWelcomeBonusForEmail("nobody@example.com")).reason).toBe("USER_NOT_FOUND");

    const { userId: oldId } = await createTestUser(db, schema, { email: "old@example.com" });
    await db.update(schema.users)
      .set({ createdAt: new Date(Date.now() - 24 * 3600_000) })
      .where(eq(schema.users.id, oldId));
    expect((await svc.checkWelcomeBonusForEmail("OLD@example.com")).reason).toBe("NOT_ELIGIBLE");

    const fresh = await newUser();
    const row = await db.query.users.findFirst({ where: eq(schema.users.id, fresh) });
    const res = await svc.checkWelcomeBonusForEmail(row!.email);
    expect(res.reason).toBeNull();
    expect(res.found).toBe(true);
  });
});

