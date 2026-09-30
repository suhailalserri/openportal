/**
 * P5.3 - speech-to-text models through the REAL appRouter against a real Postgres:
 *   - a published model with the "transcription" category is NOT in the public chat list
 *   - re-saving it through models.publish (whose category filter only knows chat keys) keeps the marker
 * RED on old code: models.list returned every published model, and publish overwrote categories.
 *
 * (header below is the P3.6 file's, kept identical so the mocks match)
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

const publishInput = (modelId: string, o: Record<string, unknown> = {}) => ({
  modelId, displayName: "M", displayNameAr: "M", contextWindow: 8000, maxOutputTokens: 1000,
  markupMultiplier: 2, wholesaleCostInputPerM: 100, wholesaleCostOutputPerM: 0, ...o,
});

async function seedPublished(id: string, categories: string[]) {
  await db.insert(schema.models).values({
    id, displayName: id, displayNameAr: id, provider: "openai",
    contextWindow: 8000, maxOutputTokens: 1000, status: "published", isAvailable: true, categories,
  });
}

describe("P5.3 transcription models stay out of chat", () => {
  it("the public model list hides a transcription model and keeps chat models", async () => {
    await seedPublished("whisper-1", ["audio", "transcription"]);
    await seedPublished("gpt-4o-mini", ["vision"]);
    const anon = createCallerFactory(appRouter)({ db, user: null, ip: "203.0.113.9" } as any);
    const list = await anon.models.list();
    expect(list.map((m) => m.id)).toEqual(["gpt-4o-mini"]);
  });

  it("re-saving a transcription model in the admin form keeps its marker", async () => {
    await seedPublished("whisper-1", ["audio", "transcription"]);
    const api = await adminApi();
    await api.models.publish(publishInput("whisper-1", { categories: ["audio"] }));
    const row = await db.query.models.findFirst({ where: eq(schema.models.id, "whisper-1") });
    expect(row?.categories).toContain("transcription");
    expect(row?.categories).toContain("audio");
    const anon = createCallerFactory(appRouter)({ db, user: null, ip: "203.0.113.9" } as any);
    expect((await anon.models.list()).map((m) => m.id)).not.toContain("whisper-1");
  });

  it("a normal model does not gain the marker", async () => {
    await seedPublished("gpt-4o-mini", []);
    const api = await adminApi();
    await api.models.publish(publishInput("gpt-4o-mini", { categories: ["vision"] }));
    const row = await db.query.models.findFirst({ where: eq(schema.models.id, "gpt-4o-mini") });
    expect(row?.categories).toEqual(["vision"]);
  });
});
