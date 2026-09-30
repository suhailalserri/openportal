import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser, createTestSession } from "../test/factories";
import { FakeRedis } from "../test/fakeRedis";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let FraudService: typeof import("./fraud.service").FraudService;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ FraudService } = await import("./fraud.service"));
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  // Make sure alertAdmin() stays a no-op (no real Telegram calls in tests).
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

async function fraudEventsFor(userId: string) {
  return db.query.fraudEvents.findMany({ where: (e: any, { eq }: any) => eq(e.userId, userId) });
}

describe("FraudService.trackRequestIdentity (P3.1: identity signals only, never blocks)", () => {
  it("resolves without blocking however many requests a user sends (rate limiting moved to redis-rate-limiter)", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);

    for (let i = 0; i < 60; i++) {
      await expect(fraud.trackRequestIdentity(userId, "1.2.3.4")).resolves.toBeUndefined();
    }
    const events = await fraudEventsFor(userId);
    expect(events.some((e: any) => e.type === "HIGH_REQUEST_VELOCITY")).toBe(false);
  });

  it("does not write a per-minute rate counter any more (the buggy rate:{user}:rpm key is gone)", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);
    let incrCalls = 0;
    const origIncr = redis.incr.bind(redis);
    redis.incr = async (k: string) => { incrCalls++; return origIncr(k); };

    await fraud.trackRequestIdentity(userId, "2.2.2.2");
    expect(incrCalls).toBe(0);
  });

  it("flags HIGH severity when more than 3 distinct users share one IP in a day", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const sharedIp = "10.0.0.99";
    const flaggedUserIds: string[] = [];

    for (let i = 0; i < 5; i++) {
      const { userId } = await createTestUser(db, schema, { email: `shared-${i}@example.com` });
      await fraud.trackRequestIdentity(userId, sharedIp);
      flaggedUserIds.push(userId);
    }

    // The 4th and 5th distinct users from this IP should trigger the event.
    const lastUserEvents = await fraudEventsFor(flaggedUserIds[flaggedUserIds.length - 1]!);
    expect(lastUserEvents.some((e: any) => e.type === "SHARED_IP_MULTI_ACCOUNT" && e.severity === "high")).toBe(true);
  });

  it("logs a low-severity MULTIPLE_IPS event when one user appears from more than 5 IPs in a day", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);

    for (let i = 1; i <= 6; i++) await fraud.trackRequestIdentity(userId, `8.8.8.${i}`);

    const events = await fraudEventsFor(userId);
    expect(events.some((e: any) => e.type === "MULTIPLE_IPS" && e.severity === "low")).toBe(true);
  });
});

describe("FraudService.recordRequestRateExceeded (P3.1)", () => {
  it("writes one HIGH_REQUEST_VELOCITY medium-severity row with the count and ip", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);

    await fraud.recordRequestRateExceeded(userId, "3.3.3.3", 21);

    const events = await fraudEventsFor(userId);
    const hit = events.filter((e: any) => e.type === "HIGH_REQUEST_VELOCITY");
    expect(hit).toHaveLength(1);
    expect(hit[0]!.severity).toBe("medium");
    expect(hit[0]!.details).toMatchObject({ count: 21, ip: "3.3.3.3" });
  });

  it("does not suspend the user (medium severity is audit-only)", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);

    await fraud.recordRequestRateExceeded(userId, "3.3.3.3", 21);

    const user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.id, userId) });
    expect(user?.isFraudFlagged).toBe(false);
  });
});

describe("FraudService.checkRedeemAttempt", () => {
  it("blocks after 5 attempts/hour with TOO_MANY_ATTEMPTS and logs a high-severity event", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);

    const results = [];
    for (let i = 0; i < 8; i++) {
      results.push(await fraud.checkRedeemAttempt(userId, "1.1.1.1"));
    }

    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
    expect(results.slice(5).every((r) => !r.allowed && r.reason === "TOO_MANY_ATTEMPTS")).toBe(true);

    const events = await fraudEventsFor(userId);
    expect(events.some((e: any) => e.type === "REDEEM_BRUTE_FORCE" && e.severity === "high")).toBe(true);
  });
});

describe("FraudService.checkSpendVelocity", () => {
  it("auto-flags the user as fraud (critical) once hourly spend exceeds the threshold", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);

    // Threshold is 1000 credits/hour = 1_000_000_000 micro-credits.
    await fraud.checkSpendVelocity(userId, 600_000_000);
    let user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.id, userId) });
    expect(user?.isFraudFlagged).toBe(false);

    await fraud.checkSpendVelocity(userId, 500_000_000); // total now 1.1B > 1B threshold
    user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.id, userId) });
    expect(user?.isFraudFlagged).toBe(true);
    expect(user?.fraudReason).toBe("HIGH_SPEND_VELOCITY");

    const events = await fraudEventsFor(userId);
    expect(events.some((e: any) => e.type === "HIGH_SPEND_VELOCITY" && e.severity === "critical")).toBe(true);
  });

  it("does NOT flag a user spending under the threshold — no false positive", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);

    await fraud.checkSpendVelocity(userId, 900_000_000); // under 1B threshold

    const user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.id, userId) });
    expect(user?.isFraudFlagged).toBe(false);
  });
});

describe("FraudService — critical event revokes sessions (P1.1 item 5)", () => {
  it("auto-flagging on HIGH_SPEND_VELOCITY deletes the user's live sessions", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);
    await createTestSession(db, schema, userId);
    const other = await createTestUser(db, schema);
    await createTestSession(db, schema, other.userId);

    // Far above any plausible MAX_CREDITS_PER_HOUR threshold.
    await fraud.checkSpendVelocity(userId, 1_000_000_000_000_000);

    const sessionsOf = async (id: string) =>
      (await db.query.sessions.findMany({ where: (s: any, { eq }: any) => eq(s.userId, id) })).length;
    expect(await sessionsOf(userId)).toBe(0);
    expect(await sessionsOf(other.userId)).toBe(1);
  });
});
