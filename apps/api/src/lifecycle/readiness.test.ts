import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createReadiness } from "./readiness";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const ok = () => Promise.resolve("ok");

describe("createReadiness", () => {
  it("200 ready when DB and Redis answer", async () => {
    const r = createReadiness({ checkDb: ok, checkRedis: ok, isDraining: () => false });
    expect(await r.check()).toEqual({ statusCode: 200, body: { status: "ready", db: "ok", redis: "ok" } });
  });

  it("503 and names the failing dependency when one is down", async () => {
    const r = createReadiness({ checkDb: ok, checkRedis: () => Promise.reject(new Error("ECONNREFUSED")), isDraining: () => false });
    expect(await r.check()).toEqual({ statusCode: 503, body: { status: "not_ready", db: "ok", redis: "down" } });
  });

  it("treats a hung probe as down after the timeout", async () => {
    const r = createReadiness({ checkDb: () => new Promise(() => {}), checkRedis: ok, isDraining: () => false, timeoutMs: 2_000 });
    const p = r.check();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await p).toEqual({ statusCode: 503, body: { status: "not_ready", db: "down", redis: "ok" } });
  });

  it("returns draining before any probe or cache, and flips instantly", async () => {
    let draining = false;
    const checkDb = vi.fn(ok);
    const r = createReadiness({ checkDb, checkRedis: ok, isDraining: () => draining });
    expect((await r.check()).statusCode).toBe(200);
    draining = true;
    expect(await r.check()).toEqual({ statusCode: 503, body: { status: "draining" } });
    expect(checkDb).toHaveBeenCalledTimes(1);
  });

  it("caches for the TTL, then probes again", async () => {
    let t = 0;
    const checkDb = vi.fn(ok);
    const r = createReadiness({ checkDb, checkRedis: ok, isDraining: () => false, ttlMs: 5_000, now: () => t });
    await r.check(); await r.check();
    expect(checkDb).toHaveBeenCalledTimes(1);
    t = 5_000;
    await r.check();
    expect(checkDb).toHaveBeenCalledTimes(2);
  });

  it("concurrent callers share one probe", async () => {
    const checkDb = vi.fn(ok);
    const r = createReadiness({ checkDb, checkRedis: ok, isDraining: () => false });
    await Promise.all([r.check(), r.check(), r.check()]);
    expect(checkDb).toHaveBeenCalledTimes(1);
  });
});
