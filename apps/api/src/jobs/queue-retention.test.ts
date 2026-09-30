import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import {
  jobRetention, COMPLETE_MAX_AGE_SECONDS, COMPLETE_MAX_COUNT, FAIL_MAX_AGE_SECONDS,
} from "./queue-policy";
import { createFailureTracker, attachJobFailureTracking } from "./job-failures";
import { attachWorkerErrorReporting } from "../monitoring/worker-errors";
import { setErrorSink } from "../monitoring/error-hook";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => Promise<boolean>, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await cond()) return; await sleep(100); }
  throw new Error("waitFor timed out");
}

describe("queue retention policy (P2.3)", () => {
  it("has TEST_REDIS_URL in CI (real-Redis tests must never silently skip)", () => {
    if (process.env.CI) expect(TEST_REDIS_URL, "deploy.yml api-tests must provide redis").toBeTruthy();
  });

  it("defaults match the plan: complete 24h/1000, fail 7d", () => {
    expect(COMPLETE_MAX_AGE_SECONDS).toBe(86_400);
    expect(COMPLETE_MAX_COUNT).toBe(1_000);
    expect(FAIL_MAX_AGE_SECONDS).toBe(604_800);
    expect(jobRetention()).toEqual({
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800 },
    });
  });

  it("EVERY queue in queue.ts spreads jobRetention() (guard against a new queue without it)", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(dir, "queue.ts"), "utf8");
    const queues = src.match(/new Queue\(/g)?.length ?? 0;
    const withRetention = src.match(/\.\.\.jobRetention\(\)/g)?.length ?? 0;
    expect(queues).toBeGreaterThan(0);
    expect(withRetention).toBe(queues);
  });
});

describe.skipIf(!TEST_REDIS_URL)("failing job: captured, counted, expires (real Redis)", () => {
  const prefix = `t-${randomUUID().slice(0, 8)}`;
  let conn: Redis;
  let queue: Queue;
  let worker: Worker<unknown, void>;
  const sinkCalls: Array<{ tags?: Record<string, string> | undefined }> = [];
  const counted: string[] = [];

  beforeAll(async () => {
    conn = new Redis(TEST_REDIS_URL!, { maxRetriesPerRequest: null });
    queue = new Queue("p23", {
      connection: conn, prefix,
      defaultJobOptions: { attempts: 1, ...jobRetention({ failAgeSeconds: 1 }) },
    });
    worker = new Worker<unknown, void>("p23", async (): Promise<void> => { throw new Error("deliberate p2.3 failure"); },
      { connection: conn.duplicate(), prefix });
    setErrorSink((_e, ctx) => { sinkCalls.push({ tags: ctx?.tags }); });
    attachWorkerErrorReporting(worker, "p23");
    attachJobFailureTracking(worker, "p23", createFailureTracker({ count: (q) => counted.push(q), alert: () => {} }));
  });

  afterAll(async () => {
    setErrorSink(null);
    await worker?.close();
    await queue?.obliterate({ force: true }).catch(() => {});
    await queue?.close();
    conn?.disconnect();
  });

  it("failure reaches Sentry sink with queue tag, is counted, and job is kept in 'failed'", async () => {
    const job = await queue.add("boom", { secret: "must-not-leak" });
    await waitFor(async () => (await queue.getFailedCount()) >= 1);
    expect(sinkCalls.length).toBeGreaterThanOrEqual(1);
    expect(sinkCalls[0]!.tags).toMatchObject({ source: "worker", queue: "p23", job: "boom" });
    expect(JSON.stringify(sinkCalls)).not.toContain("must-not-leak");
    expect(counted).toContain("p23");
    expect(await queue.getJob(job.id!)).toBeTruthy();
  });

  it("the failed job expires after removeOnFail.age once later jobs finish", async () => {
    const first = (await queue.getFailed())[0]!;
    await sleep(2_000); // > age (1s)
    await queue.add("boom2", {}); // BullMQ trims old finished jobs when another job finishes
    await waitFor(async () => (await queue.getJob(first.id!)) == null);
    expect(await queue.getJob(first.id!)).toBeFalsy();
  });
});
