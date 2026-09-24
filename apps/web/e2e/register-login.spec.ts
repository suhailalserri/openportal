import { test, expect } from "@playwright/test";
import { hasDb, sql } from "./support/db";

/**
 * apps/web/e2e/register-login.spec.ts (Phase 9.2a)
 *
 * Register through the real form → land on /auth/verify → (CI cannot
 * receive email: RESEND_API_KEY is a placeholder and lib/auth.ts swallows
 * the send failure) mark the account verified directly in the DB, exactly
 * what an admin would do by hand → sign in through the real form → /chat.
 *
 * NOT covered: email delivery / the verification link itself.
 * Requires the e2e job to run with empty Turnstile keys (the widget then
 * reports its "no-turnstile-configured" placeholder token).
 */
test.describe("register → login", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": "10.20.0.3" } });
  test.skip(!hasDb, "needs DATABASE_URL to verify the new account");

  test("new account can register, then sign in", async ({ page }) => {
    const email = `e2e+${Date.now()}@example.com`;
    const password = "E2e-Passw0rd-x";

    await page.goto("/en/auth/register");
    await page.getByLabel("Display name").fill("E2E Newcomer");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/en\/auth\/verify/, { timeout: 15_000 });

    sql(`UPDATE users SET email_verified = true, status = 'active', updated_at = now() WHERE email = '${email}'`);

    await page.goto("/en/auth/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/en\/chat$/, { timeout: 15_000 });
  });
});
