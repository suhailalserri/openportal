import { test as setup, expect } from "@playwright/test";

/**
 * apps/web/e2e/auth.setup.ts (Phase 8c fix)
 *
 * Signs in as the seeded admin ONCE and saves the session to
 * e2e/.auth/admin.json; admin specs reuse it via `test.use({ storageState })`.
 *
 * Why: admin-money.spec.ts used to sign in inside beforeEach — 4 tests +
 * 1 retry each + login.spec.ts's 2 = 10+ sign-ins per CI run against a
 * production build (`next start`), where better-auth's rate limiter is
 * active (`rateLimit: { window: 60, max: 5 }` in lib/auth.ts). Sign-ins
 * past the limit are rejected and the page stays on /en/auth/login —
 * exactly the "Received string: …/en/auth/login" failure in CI.
 */
const ADMIN_STATE = "e2e/.auth/admin.json";

setup("sign in as admin", async ({ page }) => {
  await page.goto("/en/auth/login");
  await page.getByLabel("Email address").fill("admin@localhost.dev");
  await page.getByLabel("Password").fill("Admin123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/en\/chat$/, { timeout: 15_000 });
  await page.context().storageState({ path: ADMIN_STATE });
});
