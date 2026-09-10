import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";
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

describe("FraudService.checkRequestVelocity", () => {
  it("allows requests at or under the per-minute threshold (20)", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);

    for (let i = 0; i < 20; i++) {
      const result = await fraud.checkRequestVelocity(userId, "1.2.3.4");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks and logs a fraud event once the per-minute threshold is exceeded — no false negative", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const { userId } = await createTestUser(db, schema);

    let blockedAt = -1;
    for (let i = 0; i < 30; i++) {
      const result = await fraud.checkRequestVelocity(userId, "1.2.3.4");
      if (!result.allowed) { blockedAt = i; break; }
    }

    expect(blockedAt).toBe(20); // the 21st request (index 20) trips the limit
    const events = await fraudEventsFor(userId);
    expect(events.some((e: any) => e.type === "HIGH_REQUEST_VELOCITY" && e.severity === "medium")).toBe(true);
  });

  it("property-style: any burst of >20 requests/minute is always blocked before it ends", async () => {
    for (const burstSize of [21, 25, 40, 75, 200]) {
      const redis = new FakeRedis();
      const fraud = new (FraudService as any)(redis);
      const { userId } = await createTestUser(db, schema, { email: `burst-${burstSize}@example.com` });

      let sawBlock = false;
      for (let i = 0; i < burstSize; i++) {
        const result = await fraud.checkRequestVelocity(userId, "9.9.9.9");
        if (!result.allowed) { sawBlock = true; break; }
      }
      expect(sawBlock, `burst of ${burstSize} should have been blocked`).toBe(true);
    }
  });

  it("property-style: any sequence at or below 20 requests/minute is never blocked", async () => {
    for (const trial of Array.from({ length: 10 }, () => Math.floor(Math.random() * 20) + 1)) {
      const redis = new FakeRedis();
      const fraud = new (FraudService as any)(redis);
      const { userId } = await createTestUser(db, schema, { email: `safe-${randomUUID()}@example.com` });

      for (let i = 0; i < trial; i++) {
        const result = await fraud.checkRequestVelocity(userId, "5.5.5.5");
        expect(result.allowed).toBe(true);
      }
    }
  });

  it("flags HIGH severity when more than 3 distinct users share one IP in a day", async () => {
    const redis = new FakeRedis();
    const fraud = new (FraudService as any)(redis);
    const sharedIp = "10.0.0.99";
    const flaggedUserIds: string[] = [];

    for (let i = 0; i < 5; i++) {
      const { userId } = await createTestUser(db, schema, { email: `shared-${i}@example.com` });
      await fraud.checkRequestVelocity(userId, sharedIp);
      flaggedUserIds.push(userId);
    }

    // The 4th and 5th distinct users from this IP should trigger the event.
    const lastUserEvents = await fraudEventsFor(flaggedUserIds[flaggedUserIds.length - 1]!);
    expect(lastUserEvents.some((e: any) => e.type === "SHARED_IP_MULTI_ACCOUNT" && e.severity === "high")).toBe(true);
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
