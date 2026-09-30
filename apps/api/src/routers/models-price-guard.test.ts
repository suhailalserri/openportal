/**
 * P3.6 - models.publish through the REAL appRouter against a real Postgres:
 *   - saving a price below cost sends a Telegram alert (plan "done when")
 *   - a healthy price does not
 *   - provider_prices history is written in the same transaction
 *   - an alert failure never fails the admin's save (L12)
 * RED on old code: publish wrote no provider_prices row and sent no alert.
 */
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { startTestDb, stopTestDb, resetTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

vi.mock("../config", () => ({
  config: {
    GATEWAY_URL: "http://mock-gateway.test", GATEWAY_MASTER_KEY: "mock-key-0123456789",
    GATEWAY_ROOT_TOKEN: "mock-root-0123456789", REDIS_URL: "redis://localhost:1/0",
    FRONTEND_URL: "http://localhost:3000", SUMMARIZATION_MODEL: "gpt-4o-mini",
    RESEND_API_KEY: "x", RESEND_FROM_EMAIL: "a@example.com", RESEND_FROM_NAME: "t",
  },
}));
vi.mock("../services/gateway-channels.service", () => ({ fetchGatewayChannels: vi.fn() }));
vi.mock("../services/model-sync.service", () => ({ syncModelsFromGateway: vi.fn() }));
vi.mock("../monitoring/telegram", async (orig) => ({
  ...(await orig<typeof import("../monitoring/telegram")>()),
  sendTelegram: vi.fn(async () => ({ ok: true, configured: true })),
}));

let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let appRouter: typeof import("./index").appRouter;
let createCallerFactory: typeof import("./index").createCallerFactory;
let sendTelegram: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  ({ appRouter, createCallerFactory } = await import("./index"));
  sendTelegram = (await import("../monitoring/telegram")).sendTelegram as unknown as ReturnType<typeof vi.fn>;
}, 60_000);
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await resetTestDb(); sendTelegram.mockClear(); });

async function adminApi() {
  const { userId } = await createTestUser(db, schema, { role: "admin" });
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return createCallerFactory(appRouter)({ db, user: user ?? null, ip: "203.0.113.9" } as any);
}

async function seedPending(id: string) {
  await db.insert(schema.models).values({
    id, displayName: id, displayNameAr: id, provider: "openrouter",
    contextWindow: 8000, maxOutputTokens: 1000, status: "pending", isAvailable: false,
  });
}

const publishInput = (modelId: string, o: Record<string, unknown> = {}) => ({
  modelId, displayName: "M", displayNameAr: "M", contextWindow: 8000, maxOutputTokens: 1000,
  markupMultiplier: 2, wholesaleCostInputPerM: 5, wholesaleCostOutputPerM: 15, ...o,
});

const currentPrices = (modelId: string) =>
  db.select().from(schema.providerPrices).where(eq(schema.providerPrices.modelId, modelId));

describe("models.publish - provider-cost guard (P3.6)", () => {
  it("a price below cost triggers a critical Telegram alert naming the model", async () => {
    await seedPending("vendor/m");
    const api = await adminApi();
    await api.models.publish(publishInput("vendor/m", { markupMultiplier: 0.8 }));
    await vi.waitFor(() => expect(sendTelegram).toHaveBeenCalledTimes(1));
    const [msg, level] = sendTelegram.mock.calls[0]!;
    expect(level).toBe("critical");
    expect(msg).toContain("vendor/m");
    expect(msg).toContain("below_cost");
  });

  it("a margin under the 40% bar triggers a warning", async () => {
    await seedPending("vendor/m");
    await (await adminApi()).models.publish(publishInput("vendor/m", { markupMultiplier: 1.3 }));
    await vi.waitFor(() => expect(sendTelegram).toHaveBeenCalledTimes(1));
    expect(sendTelegram.mock.calls[0]![1]).toBe("warning");
  });

  it("a healthy price sends nothing", async () => {
    await seedPending("vendor/m");
    await (await adminApi()).models.publish(publishInput("vendor/m"));
    await new Promise((r) => setTimeout(r, 50));
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("editing an already-published model down to a loss alerts on the edit", async () => {
    await seedPending("vendor/m");
    const api = await adminApi();
    await api.models.publish(publishInput("vendor/m"));
    sendTelegram.mockClear();
    await api.models.publish(publishInput("vendor/m", { markupMultiplier: 0.5 }));
    await vi.waitFor(() => expect(sendTelegram).toHaveBeenCalledTimes(1));
    expect(sendTelegram.mock.calls[0]![1]).toBe("critical");
  });

  it("writes provider_prices per 1K, and a later price change keeps the history", async () => {
    await seedPending("vendor/m");
    const api = await adminApi();
    await api.models.publish(publishInput("vendor/m"));
    let rows = await currentPrices("vendor/m");
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.inputPriceUsd)).toBeCloseTo(0.005, 8);
    expect(Number(rows[0]!.outputPriceUsd)).toBeCloseTo(0.015, 8);

    await api.models.publish(publishInput("vendor/m", { wholesaleCostInputPerM: 6 }));
    rows = await currentPrices("vendor/m");
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.effectiveTo === null)).toHaveLength(1);

    await api.models.publish(publishInput("vendor/m", { wholesaleCostInputPerM: 6, displayName: "Renamed" }));
    expect(await currentPrices("vendor/m")).toHaveLength(2); // non-price edit: no new row
  });

  it("an unknown model is NOT_FOUND and leaves no price row behind", async () => {
    const api = await adminApi();
    await expect(api.models.publish(publishInput("vendor/ghost"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await currentPrices("vendor/ghost")).toHaveLength(0);
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("a Telegram failure does not fail or roll back the save", async () => {
    await seedPending("vendor/m");
    sendTelegram.mockRejectedValueOnce(new Error("telegram down"));
    const api = await adminApi();
    await expect(api.models.publish(publishInput("vendor/m", { markupMultiplier: 0.8 }))).resolves.toEqual({ success: true });
    const row = await db.query.models.findFirst({ where: eq(schema.models.id, "vendor/m") });
    expect(row?.status).toBe("published");
    expect(await currentPrices("vendor/m")).toHaveLength(1);
  });
});
