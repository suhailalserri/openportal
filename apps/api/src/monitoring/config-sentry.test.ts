import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * P2.1 mitigation: a blank or mistyped SENTRY_DSN in Render must NOT stop the
 * api booting (config.ts throws at import on any invalid env var).
 */
const REQUIRED = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  GATEWAY_URL: "http://localhost:3001",
  GATEWAY_MASTER_KEY: "k".repeat(16),
  GATEWAY_ROOT_TOKEN: "r".repeat(16),
  BETTER_AUTH_SECRET: "a".repeat(40),
  INTERNAL_SERVICE_TOKEN: "i".repeat(40),
  RESEND_API_KEY: "re_test",
  RESEND_FROM_EMAIL: "noreply@example.com",
  CODE_SALT: "s".repeat(20),
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("config.ts SENTRY_* variables", () => {
  for (const value of ["", "   ", "not a url", "http://insecure/1"]) {
    it(`loads with SENTRY_DSN=${JSON.stringify(value)}`, async () => {
      vi.resetModules();
      for (const [k, v] of Object.entries(REQUIRED)) vi.stubEnv(k, v);
      vi.stubEnv("SENTRY_DSN", value);
      const { config } = await import("../config");
      expect(config.SENTRY_DSN).toBe(value);
    });
  }

  it("loads with SENTRY_DSN unset", async () => {
    vi.resetModules();
    for (const [k, v] of Object.entries(REQUIRED)) vi.stubEnv(k, v);
    delete process.env.SENTRY_DSN;
    const { config } = await import("../config");
    expect(config.SENTRY_DSN).toBeUndefined();
  });
});
