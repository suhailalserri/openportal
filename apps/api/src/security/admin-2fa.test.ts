/**
 * P3.5 — admin 2FA gate (ADMIN_REQUIRE_2FA).
 *
 * Router-level cases use the REAL appRouter with a hand-built context (same
 * shape as apps/web/server/context.ts). The gate sits in `adminProcedure`
 * BEFORE the input parser, so a deliberately invalid input (`limit: 0`) is a
 * probe: BAD_REQUEST means "the gate let me through", FORBIDDEN means "blocked".
 * No database is touched.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, afterEach, describe, it, expect, vi } from "vitest";
import {
  checkAdminTwoFactor, isAdminTwoFactorRequired, adminTwoFactorBootWarning, ADMIN_2FA_REQUIRED_CODE,
} from "./admin-2fa";

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

afterEach(() => { vi.unstubAllEnvs(); });

describe("checkAdminTwoFactor (pure)", () => {
  it("flag unset or blank: everyone passes, enrolled or not", () => {
    for (const env of [{}, { ADMIN_REQUIRE_2FA: "" }, { ADMIN_REQUIRE_2FA: "  " }]) {
      expect(checkAdminTwoFactor({ twoFactorEnabled: false }, env)).toEqual({ ok: true });
      expect(checkAdminTwoFactor({ twoFactorEnabled: null }, env)).toEqual({ ok: true });
      expect(checkAdminTwoFactor({}, env)).toEqual({ ok: true });
    }
  });

  it("only the literal 'true' (any case, trimmed) turns it on; typos never do", () => {
    for (const v of ["true", "TRUE", " True "]) expect(isAdminTwoFactorRequired({ ADMIN_REQUIRE_2FA: v })).toBe(true);
    for (const v of ["1", "yes", "on", "false", "tru", "enabled", ""]) expect(isAdminTwoFactorRequired({ ADMIN_REQUIRE_2FA: v })).toBe(false);
  });

  it("flag on: enrolled passes; not enrolled, null or missing is blocked", () => {
    const env = { ADMIN_REQUIRE_2FA: "true" };
    expect(checkAdminTwoFactor({ twoFactorEnabled: true }, env)).toEqual({ ok: true });
    for (const u of [{ twoFactorEnabled: false }, { twoFactorEnabled: null }, {}]) {
      expect(checkAdminTwoFactor(u, env)).toEqual({ ok: false, reason: ADMIN_2FA_REQUIRED_CODE });
    }
  });

  it("boot warning: production with the flag off only", () => {
    expect(adminTwoFactorBootWarning("production", {})).toMatch(/ADMIN_REQUIRE_2FA/);
    expect(adminTwoFactorBootWarning("production", { ADMIN_REQUIRE_2FA: "true" })).toBeUndefined();
    expect(adminTwoFactorBootWarning("development", {})).toBeUndefined();
    expect(adminTwoFactorBootWarning("test", {})).toBeUndefined();
  });
});

describe("adminProcedure with the gate (real appRouter)", () => {
  let make: (user: object) => any;

  beforeAll(async () => {
    const { db } = await import("@ai-platform/db");
    const { appRouter, createCallerFactory } = await import("../routers/index");
    make = (user) => createCallerFactory(appRouter)({ db, user, ip: "203.0.113.9" } as any);
  }, 30_000);

  const admin = (over: object = {}) => ({
    id: randomUUID(), role: "admin", status: "active", isFraudFlagged: false, twoFactorEnabled: false, ...over,
  });
  // Invalid on purpose: reaches the input parser only if the guard passed.
  const probe = (api: any) => api.admin.listUsers({ limit: 0 });
  const blocked = { code: "FORBIDDEN", message: ADMIN_2FA_REQUIRED_CODE };

  it("flag UNSET: an admin without 2FA is not blocked (deploying the code changes nothing)", async () => {
    delete process.env.ADMIN_REQUIRE_2FA; // genuinely unset, not just blank
    await expect(probe(make(admin()))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("flag ON: an admin without 2FA gets FORBIDDEN / ADMIN_2FA_REQUIRED", async () => {
    vi.stubEnv("ADMIN_REQUIRE_2FA", "true");
    await expect(probe(make(admin()))).rejects.toMatchObject(blocked);
    await expect(probe(make(admin({ twoFactorEnabled: null })))).rejects.toMatchObject(blocked);
  });

  it("flag ON: a superadmin without 2FA is blocked too", async () => {
    vi.stubEnv("ADMIN_REQUIRE_2FA", "true");
    await expect(probe(make(admin({ role: "superadmin" })))).rejects.toMatchObject(blocked);
  });

  it("flag ON: an admin WITH 2FA passes the gate", async () => {
    vi.stubEnv("ADMIN_REQUIRE_2FA", "true");
    await expect(probe(make(admin({ twoFactorEnabled: true })))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("flag ON: the gate covers a mutation as well as a query", async () => {
    vi.stubEnv("ADMIN_REQUIRE_2FA", "true");
    await expect(
      make(admin()).admin.adjustCredits({ userId: randomUUID(), amount: 5, type: "admin_credit", reason: "r" }),
    ).rejects.toMatchObject(blocked);
  });

  it("flag ON: a non-admin still gets a plain FORBIDDEN, not the 2FA code (no information leak)", async () => {
    vi.stubEnv("ADMIN_REQUIRE_2FA", "true");
    const err = await probe(make(admin({ role: "user" }))).catch((e: any) => e);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).not.toBe(ADMIN_2FA_REQUIRED_CODE);
  });

  it("flag ON: a suspended admin still reports the suspension first", async () => {
    vi.stubEnv("ADMIN_REQUIRE_2FA", "true");
    const err = await probe(make(admin({ status: "suspended" }))).catch((e: any) => e);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).not.toBe(ADMIN_2FA_REQUIRED_CODE);
  });

  it("flag ON: no session is still UNAUTHORIZED", async () => {
    vi.stubEnv("ADMIN_REQUIRE_2FA", "true");
    await expect(probe(make(null as unknown as object))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("flag ON: ordinary (non-admin) procedures are unaffected", async () => {
    vi.stubEnv("ADMIN_REQUIRE_2FA", "true");
    const user = { id: randomUUID(), role: "user", status: "active", isFraudFlagged: false, twoFactorEnabled: false };
    // invalid input again: BAD_REQUEST proves protectedProcedure did not apply the admin gate
    await expect(make(user).billing.getTransactions({ limit: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
