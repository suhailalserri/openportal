/**
 * P3.5 — every free-text field, page size, offset and money amount that was
 * unbounded is now rejected with BAD_REQUEST, through the REAL appRouter.
 *
 * No database is needed: tRPC runs the procedure guard, then the input parser,
 * and only then the resolver, so invalid input never reaches a query. A caller
 * with a hand-built context (same shape as apps/web/server/context.ts) is enough.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { LIMITS, pageLimit, pageOffset, creditsAmount, modelIdSchema, reasonText } from "./limits";

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

let api: any;      // admin caller
let userApi: any;  // ordinary signed-in user

beforeAll(async () => {
  const { db } = await import("@ai-platform/db");
  const { appRouter, createCallerFactory } = await import("../routers/index");
  const base = { status: "active", isFraudFlagged: false, twoFactorEnabled: true };
  const make = (user: object) => createCallerFactory(appRouter)({ db, user, ip: "203.0.113.9" } as any);
  api     = make({ id: randomUUID(), role: "admin", ...base });
  userApi = make({ id: randomUUID(), role: "user",  ...base });
}, 30_000);

const bad = { code: "BAD_REQUEST" };
const s = (n: number) => "x".repeat(n);
const uid = () => randomUUID();

describe("shared schemas", () => {
  it("pageLimit: integer 1..100, default 50", () => {
    const l = pageLimit();
    expect(l.parse(undefined)).toBe(50);
    expect(l.parse(1)).toBe(1);
    expect(l.parse(100)).toBe(100);
    for (const v of [0, -1, 101, 1.5, 1_000_000_000, "5", NaN]) expect(l.safeParse(v).success).toBe(false);
  });
  it("pageOffset: integer 0..100000, default 0", () => {
    expect(pageOffset.parse(undefined)).toBe(0);
    expect(pageOffset.parse(100_000)).toBe(100_000);
    for (const v of [-1, 100_001, 0.5, Infinity]) expect(pageOffset.safeParse(v).success).toBe(false);
  });
  it("creditsAmount keeps amount * 1e6 an exact integer", () => {
    expect(creditsAmount.safeParse(LIMITS.CREDITS_MAX).success).toBe(true);
    expect(creditsAmount.safeParse(LIMITS.CREDITS_MAX + 1).success).toBe(false);
    expect(Number.isSafeInteger(LIMITS.CREDITS_MAX * 1_000_000)).toBe(true);
  });
  it("modelIdSchema / reasonText bound length and reject empty", () => {
    expect(modelIdSchema.safeParse(s(LIMITS.MODEL_ID_MAX)).success).toBe(true);
    expect(modelIdSchema.safeParse(s(LIMITS.MODEL_ID_MAX + 1)).success).toBe(false);
    expect(modelIdSchema.safeParse("").success).toBe(false);
    expect(reasonText.safeParse(s(LIMITS.REASON_MAX + 1)).success).toBe(false);
    expect(reasonText.safeParse("").success).toBe(false);
  });
});

describe("admin router inputs", () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["listUsers limit = 1,000,000,000", () => api.admin.listUsers({ limit: 1_000_000_000 })],
    ["listUsers limit = 101",           () => api.admin.listUsers({ limit: 101 })],
    ["listUsers limit = 0",             () => api.admin.listUsers({ limit: 0 })],
    ["listUsers limit = 1.5",           () => api.admin.listUsers({ limit: 1.5 })],
    ["listUsers offset = -1",           () => api.admin.listUsers({ offset: -1 })],
    ["listUsers offset = 100,001",      () => api.admin.listUsers({ offset: 100_001 })],
    ["listUsers search = 201 chars",    () => api.admin.listUsers({ search: s(LIMITS.SEARCH_MAX + 1) })],
    ["updateUserStatus reason = 501",   () => api.admin.updateUserStatus({ userId: uid(), status: "suspended", reason: s(501) })],
    ["adjustCredits amount too large",  () => api.admin.adjustCredits({ userId: uid(), amount: LIMITS.CREDITS_MAX + 1, type: "admin_credit", reason: "r" })],
    ["adjustCredits amount too negative", () => api.admin.adjustCredits({ userId: uid(), amount: -(LIMITS.CREDITS_MAX + 1), type: "admin_debit", reason: "r" })],
    ["adjustCredits reason = 501",      () => api.admin.adjustCredits({ userId: uid(), amount: 5, type: "admin_credit", reason: s(501) })],
    ["adjustCredits empty reason",      () => api.admin.adjustCredits({ userId: uid(), amount: 5, type: "admin_credit", reason: "" })],
    ["generateCodes creditValue too large", () => api.admin.generateCodes({ count: 1, creditValue: LIMITS.CREDITS_MAX + 1, label: "l" })],
    ["revokeCode code = 33 chars",      () => api.admin.revokeCode({ code: s(LIMITS.CODE_MAX + 1) })],
    ["revokeCode empty code",           () => api.admin.revokeCode({ code: "" })],
    ["listFraudEvents limit = 101",     () => api.admin.listFraudEvents({ limit: 101 })],
    ["listFraudEvents limit = 1e9",     () => api.admin.listFraudEvents({ limit: 1_000_000_000 })],
    ["createPackage credits too large", () => api.admin.createPackage({ name: "n", nameAr: "ن", priceYer: 1000, priceUsdEquivalent: 1, credits: LIMITS.CREDITS_MAX + 1 })],
    ["createPackage sortOrder = 1e9",   () => api.admin.createPackage({ name: "n", nameAr: "ن", priceYer: 1000, priceUsdEquivalent: 1, credits: 10, sortOrder: 1_000_000_000 })],
  ];
  it.each(cases)("rejects: %s", async (_name, call) => {
    await expect(call()).rejects.toMatchObject(bad);
  });
});

describe("models router inputs", () => {
  const valid = { modelId: "gpt-4o", displayName: "A", displayNameAr: "أ", contextWindow: 128_000, maxOutputTokens: 4096 };
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["publish modelId = 151 chars",   () => api.models.publish({ ...valid, modelId: s(LIMITS.MODEL_ID_MAX + 1) })],
    ["publish empty modelId",         () => api.models.publish({ ...valid, modelId: "" })],
    ["publish 51 categories",         () => api.models.publish({ ...valid, categories: Array.from({ length: 51 }, (_, i) => `c${i}`) })],
    ["publish category of 51 chars",  () => api.models.publish({ ...valid, categories: [s(51)] })],
    ["publish 51 categoryScores",     () => api.models.publish({ ...valid, categoryScores: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 50])) })],
    ["publish markup = 101",          () => api.models.publish({ ...valid, markupMultiplier: 101 })],
    ["publish contextWindow = 1e9",   () => api.models.publish({ ...valid, contextWindow: 1_000_000_000 })],
    ["publish maxOutputTokens = 1e9", () => api.models.publish({ ...valid, maxOutputTokens: 1_000_000_000 })],
    ["toggleAvailability modelId = 151 chars", () => api.models.toggleAvailability({ modelId: s(151), isAvailable: true })],
    ["toggleAvailability empty modelId",       () => api.models.toggleAvailability({ modelId: "", isAvailable: true })],
  ];
  it.each(cases)("rejects: %s", async (_name, call) => {
    await expect(call()).rejects.toMatchObject(bad);
  });
});

describe("billing router inputs (signed-in user)", () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["getTransactions offset = 100,001", () => userApi.billing.getTransactions({ offset: 100_001 })],
    ["getTransactions offset = -1",      () => userApi.billing.getTransactions({ offset: -1 })],
    ["getTransactions limit = 1.5",      () => userApi.billing.getTransactions({ limit: 1.5 })],
    ["getTransactions limit = 101",      () => userApi.billing.getTransactions({ limit: 101 })],
    ["myManualPayments limit = 2.5",     () => userApi.billing.myManualPayments({ limit: 2.5 })],
  ];
  it.each(cases)("rejects: %s", async (_name, call) => {
    await expect(call()).rejects.toMatchObject(bad);
  });
});
