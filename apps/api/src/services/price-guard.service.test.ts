/**
 * P3.6 - DB-backed pieces against a real Postgres (Testcontainers):
 *   - runPriceGuard only looks at published + available models and alerts once
 *   - provider_prices history (recordProviderPrice)
 *   - RED on old code: dashboard cost was always $0 because nothing wrote provider_prices
 *   - migration 0020 backfill (executed from the real file)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/src/services -> src -> api -> apps -> <repo root>
const MIGRATION_0020 = path.resolve(__dirname, "../../../../packages/db/src/migrations/0020_provider_prices_backfill.sql");

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let guard: typeof import("./price-guard.service");
let prices: typeof import("./provider-price.service");
let dashboard: typeof import("./dashboard.service");

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  guard = await import("./price-guard.service");
  prices = await import("./provider-price.service");
  dashboard = await import("./dashboard.service");
}, 60_000);
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await resetTestDb(); });

async function insertModel(o: Partial<typeof schema.models.$inferInsert> & { id: string }) {
  await db.insert(schema.models).values({
    // display_name / display_name_ar are varchar(100); ids can be longer (id is varchar(150)).
    displayName: o.id.slice(0, 100), displayNameAr: o.id.slice(0, 100), provider: "openrouter",
    contextWindow: 8000, maxOutputTokens: 1000, ...o,
  });
}
const priceRows = (modelId: string) =>
  db.select().from(schema.providerPrices).where(eq(schema.providerPrices.modelId, modelId));

const noFeed = async () => { throw new Error("feed down"); };

describe("runPriceGuard", () => {
  it("alerts critical for a published, available model sold below cost", async () => {
    await insertModel({ id: "vendor/loss", status: "published", isAvailable: true, markupMultiplier: "0.80", wholesaleCostInputPerM: "1", wholesaleCostOutputPerM: "2" });
    const alert = vi.fn();
    const run = await guard.runPriceGuard({ alert, fetchUpstream: async () => new Map([["vendor/loss", { input: 1, output: 2 }]]) });
    expect(run.alerted).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![1]).toBe("critical");
    expect(alert.mock.calls[0]![0]).toContain("vendor/loss");
  });

  it("ignores models users cannot buy: disabled, unavailable, pending", async () => {
    const bad = { markupMultiplier: "0.50", wholesaleCostInputPerM: "1", wholesaleCostOutputPerM: "2" } as const;
    await insertModel({ id: "vendor/disabled", status: "disabled", isAvailable: true, ...bad });
    await insertModel({ id: "vendor/hidden", status: "published", isAvailable: false, ...bad });
    await insertModel({ id: "vendor/pending", status: "pending", isAvailable: false, ...bad });
    const alert = vi.fn();
    const run = await guard.runPriceGuard({ alert, fetchUpstream: noFeed });
    expect(run.evaluation.checked).toBe(0);
    expect(alert).toHaveBeenCalledTimes(1);          // only the feed-down warning
    expect(alert.mock.calls[0]![0]).not.toContain("vendor/");
  });

  it("is silent when every model is healthy and the feed works", async () => {
    await insertModel({ id: "vendor/ok", status: "published", isAvailable: true, markupMultiplier: "2.00", wholesaleCostInputPerM: "1", wholesaleCostOutputPerM: "2" });
    const alert = vi.fn();
    const run = await guard.runPriceGuard({ alert, fetchUpstream: async () => new Map([["vendor/ok", { input: 1, output: 2 }]]) });
    expect(run.alerted).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  it("feed down: still runs the local checks and says the feed failed", async () => {
    await insertModel({ id: "vendor/loss", status: "published", isAvailable: true, markupMultiplier: "0.80", wholesaleCostInputPerM: "1", wholesaleCostOutputPerM: "2" });
    const alert = vi.fn();
    const run = await guard.runPriceGuard({ alert, fetchUpstream: noFeed });
    expect(run.upstreamError).toBe("feed down");
    const [msg, level] = alert.mock.calls[0]!;
    expect(level).toBe("critical");
    expect(msg).toContain("vendor/loss");
    expect(msg).toContain("Upstream price feed unavailable");
  });

  it("flags upstream drift when the provider raised its price", async () => {
    await insertModel({ id: "vendor/drift", status: "published", isAvailable: true, markupMultiplier: "3.00", wholesaleCostInputPerM: "1", wholesaleCostOutputPerM: "2" });
    const alert = vi.fn();
    await guard.runPriceGuard({ alert, fetchUpstream: async () => new Map([["vendor/drift", { input: 1.5, output: 2 }]]) });
    expect(alert.mock.calls[0]![0]).toContain("upstream_drift vendor/drift");
  });
});

describe("recordProviderPrice", () => {
  const snap = (o: Partial<import("./provider-price.service").WholesaleSnapshot> = {}) =>
    ({ id: "vendor/m", provider: "openrouter", wholesaleInPerM: 5, wholesaleOutPerM: 15, ...o });

  it("stores USD per 1K tokens as one open row", async () => {
    expect(await prices.recordProviderPrice(db, snap())).toBe("inserted");
    const rows = await priceRows("vendor/m");
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.inputPriceUsd)).toBeCloseTo(0.005, 8);
    expect(Number(rows[0]!.outputPriceUsd)).toBeCloseTo(0.015, 8);
    expect(rows[0]!.effectiveTo).toBeNull();
  });

  it("does nothing when the price is unchanged", async () => {
    await prices.recordProviderPrice(db, snap());
    expect(await prices.recordProviderPrice(db, snap())).toBe("unchanged");
    expect(await priceRows("vendor/m")).toHaveLength(1);
  });

  it("a price change closes the old row and opens a new one (history is kept)", async () => {
    const t1 = new Date("2026-09-01T00:00:00Z");
    const t2 = new Date("2026-09-15T00:00:00Z");
    await prices.recordProviderPrice(db, snap(), t1);
    expect(await prices.recordProviderPrice(db, snap({ wholesaleInPerM: 6 }), t2)).toBe("changed");
    const rows = (await priceRows("vendor/m")).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
    expect(rows).toHaveLength(2);
    expect(rows[0]!.effectiveTo?.toISOString()).toBe(t2.toISOString());
    expect(Number(rows[0]!.inputPriceUsd)).toBeCloseTo(0.005, 8);
    expect(rows[1]!.effectiveTo).toBeNull();
    expect(Number(rows[1]!.inputPriceUsd)).toBeCloseTo(0.006, 8);
    expect(rows.filter((r) => r.effectiveTo === null)).toHaveLength(1);
  });

  it("a provider change alone also rolls the row", async () => {
    await prices.recordProviderPrice(db, snap());
    expect(await prices.recordProviderPrice(db, snap({ provider: "other" }))).toBe("changed");
    expect((await priceRows("vendor/m")).filter((r) => r.effectiveTo === null)).toHaveLength(1);
  });

  it("skips ids longer than the provider_prices column (100) instead of failing the caller", async () => {
    const id = "x".repeat(101);
    expect(await prices.recordProviderPrice(db, snap({ id }))).toBe("skipped_id_too_long");
    expect(await priceRows(id)).toHaveLength(0);
  });

  it("works inside a transaction and rolls back with it", async () => {
    await expect(db.transaction(async (tx) => {
      await prices.recordProviderPrice(tx, snap());
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(await priceRows("vendor/m")).toHaveLength(0);
  });
});

describe("dashboard cost (RED on old code: was always 0)", () => {
  it("priced usage shows up as cost once provider_prices is maintained", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 1_000_000 });
    // 5 USD / 1M input, 15 USD / 1M output, effective from a minute ago (clock-skew safe)
    await prices.recordProviderPrice(db, { id: "vendor/m", provider: "openrouter", wholesaleInPerM: 5, wholesaleOutPerM: 15 }, new Date(Date.now() - 60_000));
    await db.insert(schema.transactions).values({
      userId, type: "usage_debit", amount: -100, balanceAfter: 999_900,
      modelId: "vendor/m", inputTokens: 1000, outputTokens: 1000,
    });
    // 1000 in * 5/1M + 1000 out * 15/1M = 0.005 + 0.015
    const stats = await dashboard.getDashboardStats();
    expect(stats.cost.last30dUsd).toBeCloseTo(0.02, 6);
  });

  it("without a provider_prices row the same usage costs 0 (the old, wrong number)", async () => {
    const { userId } = await createTestUser(db, schema, { initialMicroCredits: 1_000_000 });
    await db.insert(schema.transactions).values({
      userId, type: "usage_debit", amount: -100, balanceAfter: 999_900,
      modelId: "vendor/m", inputTokens: 1000, outputTokens: 1000,
    });
    expect((await dashboard.getDashboardStats()).cost.last30dUsd).toBe(0);
  });
});

describe("migration 0020 backfill", () => {
  const run = () => db.execute(sql.raw(fs.readFileSync(MIGRATION_0020, "utf-8")));

  it("seeds current prices per 1K, skips unpriced and over-long ids, leaves existing rows alone, and is idempotent", async () => {
    await insertModel({ id: "vendor/priced", wholesaleCostInputPerM: "5", wholesaleCostOutputPerM: "15" });
    await insertModel({ id: "vendor/unpriced" });
    await insertModel({ id: "y".repeat(120), wholesaleCostInputPerM: "1", wholesaleCostOutputPerM: "1" });
    await insertModel({ id: "vendor/existing", wholesaleCostInputPerM: "9", wholesaleCostOutputPerM: "9" });
    await prices.recordProviderPrice(db, { id: "vendor/existing", provider: "openrouter", wholesaleInPerM: 1, wholesaleOutPerM: 1 });

    await run();

    const priced = await priceRows("vendor/priced");
    expect(priced).toHaveLength(1);
    expect(Number(priced[0]!.inputPriceUsd)).toBeCloseTo(0.005, 8);
    expect(Number(priced[0]!.outputPriceUsd)).toBeCloseTo(0.015, 8);
    expect(priced[0]!.effectiveTo).toBeNull();
    expect(priced[0]!.effectiveFrom.getUTCFullYear()).toBe(2000);

    expect(await priceRows("vendor/unpriced")).toHaveLength(0);
    expect(await priceRows("y".repeat(120))).toHaveLength(0);

    const existing = await priceRows("vendor/existing");
    expect(existing).toHaveLength(1);
    expect(Number(existing[0]!.inputPriceUsd)).toBeCloseTo(0.001, 8); // not overwritten by the model's 9

    await run(); // idempotent
    expect(await priceRows("vendor/priced")).toHaveLength(1);
    expect(await priceRows("vendor/existing")).toHaveLength(1);
  });
});
