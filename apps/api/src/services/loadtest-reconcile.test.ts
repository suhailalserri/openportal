/**
 * P4.2 - infra/loadtest/reconcile.sql ("no unbilled completions"), executed from the real file
 * against a real Postgres (Testcontainers). Money-adjacent, so it has RED cases:
 *   - a completed response (assistant message with a charge) with no usage_debit is detected
 *   - a request billed twice is detected
 *   - k6 reporting more completed streams than debits is detected
 *   - a real deductCreditsAtomic + saved message passes
 * psql's `-v completed=N` is replaced by a literal here (db.execute has no psql variables).
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/src/services -> src -> api -> apps -> <repo root>
const RECONCILE_SQL = path.resolve(__dirname, "../../../../infra/loadtest/reconcile.sql");

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

type Row = { check_name: string; value: string; ok: boolean };
async function reconcile(completed: number): Promise<Record<string, Row>> {
  const text = fs.readFileSync(RECONCILE_SQL, "utf-8").replaceAll(":'completed'", `'${completed}'`);
  const rows = (await db.execute(sql.raw(text))) as unknown as Row[];
  return Object.fromEntries(rows.map((r) => [r.check_name, r]));
}
const failing = (c: Record<string, Row>) => Object.values(c).filter((r) => !r.ok).map((r) => r.check_name);

async function loadTestUser(n = 1) {
  return createTestUser(db, schema, { email: `loadtest-${String(n).padStart(4, "0")}@example.invalid`, initialMicroCredits: 0 });
}
async function chargedMessage(userId: string, requestId: string, cost: number) {
  const conversationId = randomUUID();
  await db.insert(schema.conversations).values({ id: conversationId, userId, title: "lt", modelId: "m" });
  await db.insert(schema.messages).values({
    conversationId, role: "assistant", content: "OK", inputTokens: 5, outputTokens: 1,
    creditCost: cost, modelId: "m", gatewayRequestId: requestId,
  });
}

describe("reconcile.sql", () => {
  it("passes with nothing to reconcile", async () => {
    expect(failing(await reconcile(0))).toEqual([]);
  });

  it("passes for a real billed completion (debit + saved message with the same request id)", async () => {
    const { userId } = await loadTestUser();
    await balance.creditBalance(userId, 100_000_000, "admin_credit", { description: "load-test top-up" });
    await balance.deductCreditsAtomic(userId, 1_500, "Chat usage", { modelId: "m", inputTokens: 5, outputTokens: 1, requestId: "req-ok" });
    await chargedMessage(userId, "req-ok", 1_500);

    const c = await reconcile(1);
    expect(failing(c)).toEqual([]);
    expect(c["usage_debits"]!.value).toBe("1");
    expect(c["assistant_messages_charged"]!.value).toBe("1");
  });

  it("RED: a completed response with no usage_debit (given away for free) is detected", async () => {
    const { userId } = await loadTestUser();
    await chargedMessage(userId, "req-free", 1_500);
    expect(failing(await reconcile(1))).toContain("unbilled_completions (message with no debit)");
  });

  it("RED: a request billed twice is detected", async () => {
    const { userId } = await loadTestUser();
    await balance.creditBalance(userId, 100_000_000, "admin_credit", { description: "top-up" });
    for (let i = 0; i < 2; i++) {
      await balance.deductCreditsAtomic(userId, 1_000, "Chat usage", { modelId: "m", inputTokens: 1, outputTokens: 1, requestId: "req-dup" });
    }
    expect(failing(await reconcile(2))).toContain("double_billed_requests");
  });

  it("RED: k6 saw more completed streams than there are debits", async () => {
    const { userId } = await loadTestUser();
    await balance.creditBalance(userId, 100_000_000, "admin_credit", { description: "top-up" });
    await balance.deductCreditsAtomic(userId, 1_000, "Chat usage", { modelId: "m", inputTokens: 1, outputTokens: 1, requestId: "req-1" });
    await chargedMessage(userId, "req-1", 1_000);
    expect(failing(await reconcile(3))).toContain("completed_streams_without_a_debit (k6 completed > debits)");
  });

  it("ignores real (non load-test) users", async () => {
    const { userId } = await createTestUser(db, schema, { email: "real@example.com" });
    await chargedMessage(userId, "req-real", 1_500); // would be 'unbilled' if it were a load-test user
    expect(failing(await reconcile(0))).toEqual([]);
  });
});
