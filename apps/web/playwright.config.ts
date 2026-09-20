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
 * WHAT THIS DOES NOT BOOT: apps/api (the standalone Fastify server on
 * :4000) is never started for these tests. Confirmed by reading the
 * actual code, not assumed: apps/web/app/api/trpc/[trpc]/route.ts calls
 * `@/server/router`'s appRouter in-process (no HTTP call to :4000), and
 * apps/web/lib/auth.ts's betterAuth() instance talks to Postgres
 * directly via drizzleAdapter(db, ...) — also in-process. Login and the
 * landing page (this phase's two new surfaces) only exercise apps/web,
 * so only apps/web + a real Postgres are needed here. A future e2e spec
 * that needs actual AI-provider proxying (chat) would need to add
 * apps/api back into this harness — it deliberately isn't here now
 * because nothing this phase built requires it, and booting a Fastify
 * server that no test touches only adds CI time and failure surface.
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
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `PORT=${PORT} pnpm start`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
