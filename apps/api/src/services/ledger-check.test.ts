/**
 * P4.1 - the ledger verification SQL used by the backup workflow and the restore
 * drill (infra/scripts/ledger-check.sql), executed from the real file against a
 * real Postgres (Testcontainers).
 *
 *   - after real balance.service operations every check passes
 *   - RED if a balance is changed without a transaction row (the failure the
 *     drill exists to catch) and if a balance goes negative
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/src/services -> src -> api -> apps -> <repo root>
const LEDGER_SQL = path.resolve(__dirname, "../../../../infra/scripts/ledger-check.sql");

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let balance: typeof import("./balance.service");

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  balance = await import("./balance.service");
}, 60_000);
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await resetTestDb(); });

type CheckRow = { check_name: string; value: string; ok: boolean };
async function runChecks(): Promise<Record<string, CheckRow>> {
  const rows = (await db.execute(sql.raw(fs.readFileSync(LEDGER_SQL, "utf-8")))) as unknown as CheckRow[];
  return Object.fromEntries(rows.map((r) => [r.check_name, r]));
}
const failing = (c: Record<string, CheckRow>) => Object.values(c).filter((r) => !r.ok).map((r) => r.check_name);

describe("ledger-check.sql", () => {
  it("passes on an empty database", async () => {
    const c = await runChecks();
    expect(failing(c)).toEqual([]);
    expect(c["users_count"]!.value).toBe("0");
    expect(c["info_latest_transaction_at"]!.value).toBe("none");
  });

  it("passes after real credits and debits, and reports the totals", async () => {
    const a = await createTestUser(db, schema);
    const b = await createTestUser(db, schema);
    await balance.creditBalance(a.userId, 100_000_000, "admin_credit", { description: "grant" });
    await balance.creditBalance(b.userId, 40_000_000, "redeem", { description: "code" });
    await balance.deductCreditsAtomic(a.userId, 25_000_000, "Chat usage", { modelId: "m", inputTokens: 1, outputTokens: 1, requestId: "r1" });

    const c = await runChecks();
    expect(failing(c)).toEqual([]);
    expect(c["users_count"]!.value).toBe("2");
    expect(c["balances_sum_credits"]!.value).toBe("115000000");
    expect(c["transactions_sum_amount"]!.value).toBe("115000000");
    expect(c["info_latest_transaction_at"]!.value).not.toBe("none");
  });

  it("RED: a balance changed without a transaction row is detected", async () => {
    const a = await createTestUser(db, schema);
    await balance.creditBalance(a.userId, 10_000_000, "admin_credit", { description: "grant" });
    await db.update(schema.balances).set({ credits: 10_000_005 }).where(eq(schema.balances.userId, a.userId));

    const c = await runChecks();
    expect(failing(c)).toEqual(expect.arrayContaining(["ledger_total_matches", "users_where_credits_differ_from_tx_sum"]));
    expect(c["ledger_total_matches"]!.value).toBe("5");
  });

  it("RED: hand-seeded credits with no transaction (what seed.ts does) are flagged", async () => {
    await createTestUser(db, schema, { initialMicroCredits: 5_000_000 });
    expect(failing(await runChecks())).toContain("users_where_credits_differ_from_tx_sum");
  });
});
