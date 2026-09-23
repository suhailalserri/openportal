import { defineConfig, devices } from "@playwright/test";

/**
 * apps/web/playwright.config.ts
 *
 * Phase 3.2 (docs/FRONTEND_REBUILD_PLAN.md) — first e2e harness for this
 * repo. Deliberately narrow in scope for now: a single smoke test
 * (e2e/login.spec.ts) that proves the sign-in flow actually works
 * end-to-end against a real Postgres, not mocked. More specs are added
 * to e2e/ in later phases as more surfaces stabilize.
 *
 * WHAT THIS BOOTS (updated in Phase 9.2a): apps/web (`next start`), the
 * real apps/api Fastify server on :4000 (chat/billing run end to end; it
 * needs Redis + Postgres) and a zero-dependency mock gateway on :4010
 * (e2e/mock-gateway/server.mjs). Before 9.2a only apps/web was started
 * because login/landing never touched the API.
 *
 * `webServer` runs `next start` against the already-built app (CI builds
 * with a real DATABASE_URL first, see the new `e2e` job in
 * .github/workflows/deploy.yml) — not `next dev`, so this exercises the
 * same production build the app actually ships.
 */
const PORT = 3100; // Deliberately not 3000 — avoids colliding with a
                    // developer's own `next dev` if this is ever run locally
                    // alongside it.
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // tsconfig.base.json sets exactOptionalPropertyTypes, which forbids an
  // explicit `undefined` for an optional key. Omit `workers` locally so
  // Playwright uses its own default.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // Runs first (dependency below); writes e2e/.auth/admin.json.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Three servers (Phase 9.2a). Playwright starts them in order and waits
  // for each `url` to answer before running tests.
  //  1. mock gateway — stands in for New API (see e2e/mock-gateway/server.mjs)
  //  2. apps/api     — the real Fastify server, so chat / billing run end to
  //                    end. Needs REDIS_URL + DATABASE_URL, GATEWAY_URL
  //                    pointing at the mock (http://localhost:4010) and
  //                    INTERNAL_API_URL=http://localhost:4000 for the web app.
  //                    NODE_ENV is left unset → "development" → no background
  //                    workers (they only start in production).
  //  3. apps/web     — `next start` on the production build.
  webServer: [
    {
      command: "node e2e/mock-gateway/server.mjs",
      env: { MOCK_GATEWAY_PORT: "4010" },
      url: "http://localhost:4010/health",
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: "PORT=4000 pnpm --filter @ai-platform/api start",
      cwd: "../..",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `PORT=${PORT} pnpm start`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
