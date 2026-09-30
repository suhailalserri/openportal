import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Redis from "ioredis";
import {
  withBilledOperationLock,
  replyForLockError,
  BillingLockBusyError,
  BillingLockUnavailableError,
  REQUEST_IN_PROGRESS_BODY,
  LOCK_UNAVAILABLE_BODY,
  _resetLockAlertThrottle,
  type BillingLockRedis,
  type BilledLockContext,
  type BilledLockOptions,
} from "./billing-lock.service";

/**
 * P1.2 tests. The lock is Lua + SET NX PX + TTLs, none of which fakeRedis.ts
 * models, so these run against a REAL Redis (TEST_REDIS_URL).
 *   CI:    a redis:7-alpine service container in deploy.yml `api-tests`.
 *   local: docker run --rm -p 6379:6379 redis:7   then
 *          TEST_REDIS_URL=redis://localhost:6379 pnpm --filter @ai-platform/api test
 */
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key   = (userId: string) => `lock:billed:${userId}`;

describe("billing-lock: test environment", () => {
  it("has TEST_REDIS_URL in CI (real-Redis tests must never silently skip)", () => {
    if (process.env.CI) {
      expect(
        TEST_REDIS_URL,
        "TEST_REDIS_URL is not set. deploy.yml api-tests must provide a redis service container.",
      ).toBeTruthy();
    }
  });
});

describe.skipIf(!TEST_REDIS_URL)("withBilledOperationLock (real Redis)", () => {
  let redis: Redis;
  let n = 0;
  let userId: string;

  beforeAll(() => { redis = new Redis(TEST_REDIS_URL!); });
  afterAll(async () => { await redis.quit(); });
  beforeEach(() => { userId = `test-user-${Date.now()}-${n++}`; });

  const lock = <T>(fn: (ctx: BilledLockContext) => Promise<T>, o: BilledLockOptions = {}) =>
    withBilledOperationLock<T>(userId, fn, { redis: redis as unknown as BillingLockRedis, ...o });

  it("holds the key (value = requestId) while running and deletes it on success", async () => {
    let seen: string | null = null;
    const out = await lock(async (ctx) => {
      seen = await redis.get(key(userId));
      expect(seen).toBe(ctx.requestId);
      expect(await redis.pttl(key(userId))).toBeGreaterThan(0);
      return "done";
    });
    expect(out).toBe("done");
    expect(await redis.get(key(userId))).toBeNull();
  });

  it("rejects a second concurrent request BEFORE any provider call, and leaves the first untouched", async () => {
    const provider = vi.fn(); // stands in for streamChat -> gateway fetch
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => { releaseFirst = r; });

    const first = lock(async (ctx) => { provider("first"); await gate; return ctx.requestId; });
    await sleep(50); // let the first acquire

    const second = lock(async () => { provider("second"); return "x"; });
    await expect(second).rejects.toBeInstanceOf(BillingLockBusyError);

    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledWith("first");
    expect(await redis.get(key(userId))).not.toBeNull(); // still held by the first

    releaseFirst();
    await first;
    expect(await redis.get(key(userId))).toBeNull();
  });

  it("accepts the next request once the first has finished (deduction window is inside the lock)", async () => {
    await lock(async () => "a");
    await expect(lock(async () => "b")).resolves.toBe("b");
  });

  it("does not block a different user", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const first = lock(async () => { await gate; });
    await sleep(30);
    await expect(
      withBilledOperationLock("someone-else-" + userId, async () => "ok", { redis: redis as unknown as BillingLockRedis }),
    ).resolves.toBe("ok");
    release();
    await first;
  });

  it("releases on upstream error and rethrows the original error", async () => {
    const boom = new Error("upstream 502");
    await expect(lock(async () => { throw boom; })).rejects.toBe(boom);
    expect(await redis.get(key(userId))).toBeNull();
    await expect(lock(async () => "next")).resolves.toBe("next");
  });

  it("releases on client abort", async () => {
    const ac = new AbortController();
    const run = lock(() => new Promise<void>((_, reject) => {
      ac.signal.addEventListener("abort", () => reject(new DOMException("Client disconnected", "AbortError")));
    }));
    await sleep(30);
    expect(await redis.get(key(userId))).not.toBeNull();
    ac.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(await redis.get(key(userId))).toBeNull();
  });

  it("expiry takeover is safe: a late release by the old holder never deletes the new holder's lock", async () => {
    // Heartbeat effectively off, TTL short: A's lock expires while A still runs.
    const a = lock(async () => { await sleep(500); return "A"; }, { ttlMs: 200, heartbeatMs: 60_000, requestId: "req-A" });
    await sleep(350); // A's key has expired
    expect(await redis.get(key(userId))).toBeNull();

    let releaseB!: () => void;
    const gateB = new Promise<void>((r) => { releaseB = r; });
    const b = lock(async () => { await gateB; return "B"; }, { ttlMs: 5_000, heartbeatMs: 60_000, requestId: "req-B" });
    await sleep(50);
    expect(await redis.get(key(userId))).toBe("req-B");

    await a; // A finishes and runs its compare-and-delete
    expect(await redis.get(key(userId))).toBe("req-B"); // untouched

    releaseB();
    await b;
    expect(await redis.get(key(userId))).toBeNull();
  });

  it("heartbeat keeps a long operation's lock alive past the TTL", async () => {
    const run = lock(async () => { await sleep(1_000); return "long"; }, { ttlMs: 400, heartbeatMs: 100 });
    await sleep(700); // > 1 TTL
    expect(await redis.get(key(userId))).not.toBeNull();
    await expect(lock(async () => "intruder")).rejects.toBeInstanceOf(BillingLockBusyError);
    await expect(run).resolves.toBe("long");
  });

  it("marks the lock lost (without aborting) if another owner takes it mid-operation, and leaves their lock alone on release", async () => {
    let lostSeen = false;
    const run = lock(async (ctx) => {
      await redis.set(key(userId), "someone-else"); // simulate loss + takeover
      await sleep(350); // > 1 heartbeat
      lostSeen = ctx.isLost();
      return "finished anyway";
    }, { ttlMs: 5_000, heartbeatMs: 100 });

    await expect(run).resolves.toBe("finished anyway"); // NOT aborted
    expect(lostSeen).toBe(true);
    expect(await redis.get(key(userId))).toBe("someone-else"); // compare-and-DEL didn't touch it
    await redis.del(key(userId));
  });

  it("two simultaneous acquires: exactly one wins", async () => {
    let inside = 0, maxInside = 0;
    const run = () => lock(async () => {
      inside++; maxInside = Math.max(maxInside, inside);
      await sleep(100);
      inside--;
    });
    const results = await Promise.allSettled([run(), run(), run(), run()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected"
      && (r as PromiseRejectedResult).reason instanceof BillingLockBusyError)).toHaveLength(3);
    expect(maxInside).toBe(1);
  });
});

describe("withBilledOperationLock: Redis unavailable (fail closed)", () => {
  it("throws BillingLockUnavailableError and never runs fn", async () => {
    const dead = new Redis("redis://localhost:1", {
      lazyConnect: true, maxRetriesPerRequest: 0, commandTimeout: 500, retryStrategy: () => null,
    });
    dead.on("error", () => {});
    const fn = vi.fn(async () => "should not run");

    await expect(
      withBilledOperationLock("u", fn, { redis: dead as unknown as BillingLockRedis }),
    ).rejects.toBeInstanceOf(BillingLockUnavailableError);
    expect(fn).not.toHaveBeenCalled();
    dead.disconnect();
  });
});

describe("replyForLockError", () => {
  const makeReply = () => {
    const sends: Array<{ code: number; body: unknown }> = [];
    const headers: Record<string, string> = {};
    return {
      sends, headers,
      reply: {
        header: (k: string, v: string) => { headers[k] = v; },
        status: (code: number) => ({ send: (body: unknown) => { sends.push({ code, body }); } }),
      },
    };
  };
  beforeEach(() => _resetLockAlertThrottle());

  it("busy -> 409 REQUEST_IN_PROGRESS, retryable, Retry-After: 2", () => {
    const { reply, sends, headers } = makeReply();
    expect(replyForLockError(new BillingLockBusyError(), reply)).toBe(true);
    expect(sends).toEqual([{ code: 409, body: REQUEST_IN_PROGRESS_BODY }]);
    expect(REQUEST_IN_PROGRESS_BODY).toMatchObject({ error: "REQUEST_IN_PROGRESS", retryable: true });
    expect(headers["Retry-After"]).toBe("2");
  });

  it("unavailable -> 503 and a single throttled alert", async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const a = makeReply(), b = makeReply();
    expect(replyForLockError(new BillingLockUnavailableError("down"), a.reply, { alert })).toBe(true);
    expect(replyForLockError(new BillingLockUnavailableError("down"), b.reply, { alert })).toBe(true);
    expect(a.sends).toEqual([{ code: 503, body: LOCK_UNAVAILABLE_BODY }]);
    expect(b.sends[0]?.code).toBe(503);
    await sleep(10);
    expect(alert).toHaveBeenCalledTimes(1); // throttled
  });

  it("a failing alert never affects the response", async () => {
    const { reply, sends } = makeReply();
    const alert = vi.fn().mockRejectedValue(new Error("redis down too"));
    expect(replyForLockError(new BillingLockUnavailableError("x"), reply, { alert })).toBe(true);
    await sleep(10);
    expect(sends[0]?.code).toBe(503);
  });

  it("returns false for unrelated errors so the route rethrows them", () => {
    const { reply, sends } = makeReply();
    expect(replyForLockError(new Error("something else"), reply)).toBe(false);
    expect(sends).toEqual([]);
  });
});
