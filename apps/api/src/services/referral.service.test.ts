import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let maybeAwardReferralBonus: typeof import("./referral.service").maybeAwardReferralBonus;
let getReferralStats:        typeof import("./referral.service").getReferralStats;
let redeemCode:  typeof import("./redeem.service").redeemCode;
let generateCode: typeof import("./redeem.service").generateCode;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ maybeAwardReferralBonus, getReferralStats } = await import("./referral.service"));
  ({ redeemCode, generateCode } = await import("./redeem.service"));
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

/** Test helper — createTestUser() doesn't set referral linkage itself. */
async function linkReferral(referredUserId: string, referrerUserId: string) {
  const { eq } = await import("drizzle-orm");
  await db.update(schema.users)
    .set({ referredByUserId: referrerUserId })
    .where(eq(schema.users.id, referredUserId));
}

async function insertUnusedCode(creditAmount = 100_000_000) {
  const code = generateCode();
  await db.insert(schema.redeemCodes).values({
    code,
    creditAmount,
    status:  "unused",
    batchId: randomUUID(),
  });
  return code;
}

async function getBalance(userId: string) {
  const { eq } = await import("drizzle-orm");
  return db.query.balances.findFirst({ where: eq(schema.balances.userId, userId) });
}

describe("maybeAwardReferralBonus", () => {
  it("does nothing for a user with no referrer", async () => {
    const { userId } = await createTestUser(db, schema);
    await maybeAwardReferralBonus(userId);

    const me = await db.query.users.findFirst({
      where: (u: any, { eq }: any) => eq(u.id, userId),
    });
    expect(me?.referralBonusAwardedAt).toBeNull();
  });

  it("credits the referrer exactly once and marks the referred user awarded", async () => {
    const { userId: referrer } = await createTestUser(db, schema);
    const { userId: referred } = await createTestUser(db, schema);
    await linkReferral(referred, referrer);

    await maybeAwardReferralBonus(referred);

    const referrerBalance = await getBalance(referrer);
    expect(referrerBalance?.credits).toBe(100_000_000); // REFERRAL_BONUS_MICRO_CREDITS default

    const referredRow = await db.query.users.findFirst({
      where: (u: any, { eq }: any) => eq(u.id, referred),
    });
    expect(referredRow?.referralBonusAwardedAt).not.toBeNull();

    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, referrer),
    });
    expect(txRows).toHaveLength(1);
    expect(txRows[0]!.type).toBe("referral_bonus");
  });

  it("is idempotent — calling it twice for the same referred user only awards once", async () => {
    const { userId: referrer } = await createTestUser(db, schema);
    const { userId: referred } = await createTestUser(db, schema);
    await linkReferral(referred, referrer);

    await maybeAwardReferralBonus(referred);
    await maybeAwardReferralBonus(referred);

    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, referrer),
    });
    expect(txRows).toHaveLength(1);
  });

  it(
    "under concurrent calls for the SAME referred user, exactly one award " +
      "fires — the awarded_at IS NULL filter is the atomic claim",
    async () => {
      const { userId: referrer } = await createTestUser(db, schema);
      const { userId: referred } = await createTestUser(db, schema);
      await linkReferral(referred, referrer);

      await Promise.all([
        maybeAwardReferralBonus(referred),
        maybeAwardReferralBonus(referred),
        maybeAwardReferralBonus(referred),
      ]);

      const txRows = await db.query.transactions.findMany({
        where: (t: any, { eq }: any) => eq(t.userId, referrer),
      });
      expect(txRows).toHaveLength(1);
    }
  );

  it("fires automatically on a referred user's first redeemCode() call", async () => {
    const { userId: referrer } = await createTestUser(db, schema);
    const { userId: referred } = await createTestUser(db, schema);
    await linkReferral(referred, referrer);
    const code = await insertUnusedCode(50_000_000);

    const result = await redeemCode(referred, code);
    expect(result.success).toBe(true);

    const referrerBalance = await getBalance(referrer);
    expect(referrerBalance?.credits).toBeGreaterThan(0);

    const referredRow = await db.query.users.findFirst({
      where: (u: any, { eq }: any) => eq(u.id, referred),
    });
    expect(referredRow?.referralBonusAwardedAt).not.toBeNull();
  });

  it("a SECOND redeemCode() by the same referred user does not award a second bonus", async () => {
    const { userId: referrer } = await createTestUser(db, schema);
    const { userId: referred } = await createTestUser(db, schema);
    await linkReferral(referred, referrer);

    const code1 = await insertUnusedCode(50_000_000);
    const code2 = await insertUnusedCode(50_000_000);

    await redeemCode(referred, code1);
    await redeemCode(referred, code2);

    const txRows = await db.query.transactions.findMany({
      where: (t: any, { eq }: any) => eq(t.userId, referrer),
    });
    expect(txRows).toHaveLength(1);
  });
});

describe("getReferralStats", () => {
  it("reflects referred count and awarded bonuses", async () => {
    const { userId: referrer } = await createTestUser(db, schema);
    const { userId: friend1 } = await createTestUser(db, schema);
    const { userId: friend2 } = await createTestUser(db, schema);
    await linkReferral(friend1, referrer);
    await linkReferral(friend2, referrer);

    // Only friend1 has actually paid yet.
    await maybeAwardReferralBonus(friend1);

    const stats = await getReferralStats(referrer);
    expect(stats.referredCount).toBe(2);
    expect(stats.bonusesAwarded).toBe(1);
    expect(stats.totalBonusMicroCredits).toBeGreaterThan(0);
  });

  it("returns zeroes for a user nobody has referred", async () => {
    const { userId } = await createTestUser(db, schema);
    const stats = await getReferralStats(userId);
    expect(stats.referredCount).toBe(0);
    expect(stats.bonusesAwarded).toBe(0);
    expect(stats.totalBonusMicroCredits).toBe(0);
  });
});
