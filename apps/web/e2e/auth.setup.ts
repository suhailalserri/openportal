import { test as setup, expect } from "@playwright/test";

/**
 * apps/web/e2e/auth.setup.ts
 *
 * Signs in as the seeded admin and the seeded user ONCE each and saves
 * the sessions to e2e/.auth/{admin,user}.json; specs reuse them via
 * `test.use({ storageState })` instead of signing in per test.
 *
 * Why: sign-ins inside beforeEach multiplied into 10+ per CI run against a
 * production build, where better-auth's limiter (lib/auth.ts:
 * `rateLimit: { window: 60, max: 5 }`) may reject them (diagnosis from
 * code — see BRANCH_AND_CI_NOTES.md, 8c). Two sign-ins per run here.
 */
const STATES = {
  admin: { email: "admin@localhost.dev", password: "Admin123!", path: "e2e/.auth/admin.json" },
  user: { email: "user@localhost.dev", password: "User123!", path: "e2e/.auth/user.json" },
} as const;

for (const [name, cred] of Object.entries(STATES)) {
  setup(`sign in as ${name}`, async ({ page }) => {
    await page.goto("/en/auth/login");
    await page.getByLabel("Email address").fill(cred.email);
    await page.getByLabel("Password").fill(cred.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/en\/chat$/, { timeout: 15_000 });
    await page.context().storageState({ path: cred.path });
  });
}
