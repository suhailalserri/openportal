import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { startTestDb, stopTestDb } from "../test/testDb";

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let svc: typeof import("./auth-rate-limit.service");

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  svc = await import("./auth-rate-limit.service");
}, 60_000);
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await db.delete(schema.rateLimits); });

const row = (id: string, key: string, lastRequest: number) => ({ id, key, count: 1, lastRequest });

describe("pruneAuthRateLimit", () => {
  it("deletes counters older than a day and keeps recent ones", async () => {
    await db.insert(schema.rateLimits).values([
      row("old-1", "1.1.1.1/sign-in/email", NOW - 2 * DAY),
      row("old-2", "2.2.2.2/sign-in/email", NOW - DAY - 1),
      row("new-1", "3.3.3.3/sign-in/email", NOW - 60_000),
      row("edge",  "4.4.4.4/sign-in/email", NOW - DAY),      // exactly at the cutoff: kept
    ]);
    const deleted = await svc.pruneAuthRateLimit(NOW);
    expect(deleted).toBe(2);
    const left = (await db.select().from(schema.rateLimits)).map((r) => r.id).sort();
    expect(left).toEqual(["edge", "new-1"]);
  });

  it("does nothing on an empty table", async () => {
    expect(await svc.pruneAuthRateLimit(NOW)).toBe(0);
  });

  it("stores lastRequest as a millisecond number without precision loss", async () => {
    await db.insert(schema.rateLimits).values(row("ms", "5.5.5.5/x", 1_789_012_345_678));
    const [r] = await db.select().from(schema.rateLimits);
    expect(r!.lastRequest).toBe(1_789_012_345_678);
  });
});
