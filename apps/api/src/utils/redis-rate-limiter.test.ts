import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Redis from "ioredis";
import {
  checkRateLimit,
  closeRateLimitRedis,
  _resetRateLimiterState,
  FAILURE_BACKOFF_MS,
  RATE_LIMIT_KEY_PREFIX,
  type RateLimitRedis,
} from "./redis-rate-limiter";

/**
 * P3.1 tests. The limiter is a Lua script + TTLs, which fakeRedis.ts cannot
 * model, so the behaviour tests run against a REAL Redis (TEST_REDIS_URL).
 * Same setup as billing-lock.service.test.ts (CI: redis:7-alpine service).
 */
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("redis-rate-limiter: test environment", () => {
  it("has TEST_REDIS_URL in CI (real-Redis tests must never silently skip)", () => {
    if (process.env.CI) {
      expect(
        TEST_REDIS_URL,
        "TEST_REDIS_URL is not set. deploy.yml api-tests must provide a redis service container.",
      ).toBeTruthy();
    }
  });
});

describe.skipIf(!TEST_REDIS_URL)("checkRateLimit (real Redis)", () => {
  let a: Redis;
  let b: Redis;
  let n = 0;
  let key: string;

  // Two separate connections stand in for two api replicas.
  beforeAll(() => {
    a = new Redis(TEST_REDIS_URL!);
    b = new Redis(TEST_REDIS_URL!);
  });
  afterAll(async () => { await a.quit(); await b.quit(); });
  beforeEach(() => {
    _resetRateLimiterState();
    key = `t:${Date.now()}-${n++}`;
  });

  const via = (r: Redis) => r as unknown as RateLimitRedis;

  it("allows exactly `max` hits then denies, and reports count/limit", async () => {
    const results = [];
    for (let i = 0; i < 25; i++) results.push(await checkRateLimit(key, 20, 60_000, { redis: via(a) }));
    expect(results.slice(0, 20).every((r) => r.allowed)).toBe(true);
    expect(results.slice(20).every((r) => !r.allowed)).toBe(true);
    expect(results[20]!.count).toBe(21);
    expect(results[0]).toMatchObject({ count: 1, limit: 20, degraded: false });
  });

  it("two limiter instances (two connections) share ONE budget", async () => {
    const seq: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      seq.push((await checkRateLimit(key, 10, 60_000, { redis: via(i % 2 ? a : b) })).allowed);
    }
    expect(seq.every(Boolean)).toBe(true);
    // 11th hit, from either instance, is denied: the budget was shared.
    expect((await checkRateLimit(key, 10, 60_000, { redis: via(a) })).allowed).toBe(false);
    expect((await checkRateLimit(key, 10, 60_000, { redis: via(b) })).allowed).toBe(false);
  });

  it("50 parallel calls across two connections allow exactly `max` (atomic, no over/under count)", async () => {
    const calls = Array.from({ length: 50 }, (_, i) =>
      checkRateLimit(key, 20, 60_000, { redis: via(i % 2 ? a : b) }));
    const results = await Promise.all(calls);
    expect(results.filter((r) => r.allowed)).toHaveLength(20);
    expect(results.filter((r) => !r.allowed)).toHaveLength(30);
    expect(new Set(results.map((r) => r.count)).size).toBe(50); // every call saw a distinct count
  });

  it("the window rolls over: after it expires the budget is fresh", async () => {
    const window = 400;
    for (let i = 0; i < 3; i++) await checkRateLimit(key, 3, window, { redis: via(a) });
    expect((await checkRateLimit(key, 3, window, { redis: via(a) })).allowed).toBe(false);
    await sleep(window + 150);
    const fresh = await checkRateLimit(key, 3, window, { redis: via(a) });
    expect(fresh).toMatchObject({ allowed: true, count: 1 });
  });

  it("steady traffic does NOT extend the window (regression for the old expire-on-every-call bug)", async () => {
    const window = 900;
    const start = Date.now();
    let firstAllowedAfterWindow = -1;
    // One hit every ~150 ms with max 100 (never denied): the key must still expire ~window after the FIRST hit.
    for (let i = 0; i < 12; i++) {
      const r = await checkRateLimit(key, 100, window, { redis: via(a) });
      if (r.count === 1 && i > 0) { firstAllowedAfterWindow = Date.now() - start; break; }
      await sleep(150);
    }
    expect(firstAllowedAfterWindow).toBeGreaterThan(0);
    expect(firstAllowedAfterWindow).toBeLessThan(window + 500);
  });

  it("retryAfterSeconds is the real time left, not the full window", async () => {
    await checkRateLimit(key, 1, 5_000, { redis: via(a) });
    await sleep(1_200);
    const denied = await checkRateLimit(key, 1, 5_000, { redis: via(a) });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(4);
  });

  it("self-heals a counter key that somehow has no TTL", async () => {
    await a.set(`${RATE_LIMIT_KEY_PREFIX}${key}`, "5"); // no expiry
    const r = await checkRateLimit(key, 100, 60_000, { redis: via(a) });
    expect(r.count).toBe(6);
    const ttl = await a.pttl(`${RATE_LIMIT_KEY_PREFIX}${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it("different keys are independent", async () => {
    await checkRateLimit(`${key}:x`, 1, 60_000, { redis: via(a) });
    expect((await checkRateLimit(`${key}:x`, 1, 60_000, { redis: via(a) })).allowed).toBe(false);
    expect((await checkRateLimit(`${key}:y`, 1, 60_000, { redis: via(a) })).allowed).toBe(true);
  });
});

describe("checkRateLimit: Redis outage (per-process fallback)", () => {
  beforeEach(() => _resetRateLimiterState());

  const failing = (calls?: { n: number }): RateLimitRedis => ({
    eval: async () => { if (calls) calls.n++; throw new Error("connect ECONNREFUSED"); },
  });

  it("never throws and never blocks paying users: under the cap it allows, flagged degraded", async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const r = await checkRateLimit(`out:${Math.random()}`, 20, 60_000, { redis: failing(), alert });
    expect(r).toMatchObject({ allowed: true, degraded: true, count: null, limit: 20 });
  });

  it("still enforces a per-process cap while degraded (not fully open)", async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const key = `cap:${Math.random()}`;
    const out = [];
    for (let i = 0; i < 25; i++) out.push(await checkRateLimit(key, 20, 60_000, { redis: failing(), alert }));
    expect(out.filter((r) => r.allowed)).toHaveLength(20);
    expect(out.slice(20).every((r) => !r.allowed && r.degraded)).toBe(true);
    expect(out[20]!.retryAfterSeconds).toBe(60);
  });

  it("an unreachable real client (port 1) degrades instead of throwing or hanging", async () => {
    const prev = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://localhost:1/0";
    await closeRateLimitRedis();
    const alert = vi.fn().mockResolvedValue(undefined);
    try {
      const t0 = Date.now();
      const r = await checkRateLimit(`real:${Math.random()}`, 20, 60_000, { alert });
      expect(r.degraded).toBe(true);
      expect(r.allowed).toBe(true);
      expect(Date.now() - t0).toBeLessThan(8_000);
    } finally {
      await closeRateLimitRedis();
      if (prev === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = prev;
    }
  }, 15_000);

  it("skips Redis for the backoff period after a failure, then retries it", async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const calls = { n: 0 };
    let t = 1_000_000;
    const now = () => t;
    const k = `bo:${Math.random()}`;

    await checkRateLimit(k, 20, 60_000, { redis: failing(calls), alert, now });
    expect(calls.n).toBe(1);

    t += FAILURE_BACKOFF_MS - 1;
    await checkRateLimit(k, 20, 60_000, { redis: failing(calls), alert, now });
    expect(calls.n).toBe(1); // skipped: no extra latency on a dead Redis

    t += 2;
    await checkRateLimit(k, 20, 60_000, { redis: failing(calls), alert, now });
    expect(calls.n).toBe(2); // backoff over, Redis probed again
  });

  it("recovers to the shared counter once Redis answers again", async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    let up = false;
    const store = new Map<string, number>();
    const flaky: RateLimitRedis = {
      eval: async (_s, _n, key) => {
        if (!up) throw new Error("down");
        const c = (store.get(String(key)) ?? 0) + 1;
        store.set(String(key), c);
        return [c, 30_000];
      },
    };
    let t = 5_000_000;
    const now = () => t;
    const k = `rec:${Math.random()}`;

    expect((await checkRateLimit(k, 20, 60_000, { redis: flaky, alert, now })).degraded).toBe(true);
    up = true;
    t += FAILURE_BACKOFF_MS + 1;
    const r = await checkRateLimit(k, 20, 60_000, { redis: flaky, alert, now });
    expect(r).toMatchObject({ degraded: false, count: 1, retryAfterSeconds: 30 });
  });

  it("alerts once per throttle window, not once per failure", async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    let t = 9_000_000;
    const now = () => t;
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(`al:${i}`, 20, 60_000, { redis: failing(), alert, now });
      t += FAILURE_BACKOFF_MS + 1; // each call really probes Redis and fails
    }
    expect(alert).toHaveBeenCalledTimes(1);

    t += 5 * 60_000;
    await checkRateLimit("al:late", 20, 60_000, { redis: failing(), alert, now });
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it("a failing alert sink never breaks the limiter", async () => {
    const alert = vi.fn().mockRejectedValue(new Error("telegram down"));
    const r = await checkRateLimit(`af:${Math.random()}`, 20, 60_000, { redis: failing(), alert });
    expect(r.allowed).toBe(true);
  });

  it("treats a malformed script reply as an outage (fallback), not a crash", async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const weird: RateLimitRedis = { eval: async () => "OK" };
    const r = await checkRateLimit(`wr:${Math.random()}`, 20, 60_000, { redis: weird, alert });
    expect(r.degraded).toBe(true);
  });
});
