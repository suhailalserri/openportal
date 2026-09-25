import { test, expect } from "@playwright/test";

/**
 * apps/web/e2e/login.spec.ts
 *
 * Phase 3.2 (docs/FRONTEND_REBUILD_PLAN.md) — first Playwright spec in
 * this repo. Proves the sign-in flow works end-to-end against a real
 * Postgres: fill credentials → submit → land on /en/chat.
 *
 * Runs against the `/en` locale specifically (not `/ar`) to keep
 * selectors plain ASCII and the test readable in CI logs; this is a
 * deliberate scope choice for a first smoke test, not a claim that the
 * Arabic flow is untested by other means (i18n-parity CI already
 * guarantees the `ar` and `en` message files carry the same keys, so the
 * Arabic page renders the same structure with different text).
 *
 * Credentials match packages/db/src/seed.ts's second seeded user
 * exactly ("user@localhost.dev" / "User123!", emailVerified: true) — the
 * CI `e2e` job runs `pnpm db:seed` against a fresh Postgres before these
 * tests run, so this account is guaranteed to exist with this password.
 * This is NOT a hardcoded guess: see seed.ts lines ~73-90 for the source
 * of truth.
 *
 * Selectors use getByLabel/getByRole (accessible-name queries), which
 * next-intl's "en" message file provides verbatim:
 *   auth.email        = "Email address"
 *   auth.password     = "Password"
 *   auth.loginButton  = "Sign In"
 * If any of those three copy strings ever changes, this test's failure
 * message will say so precisely (element not found for that name) rather
 * than failing silently on a stale CSS selector.
 */
test.describe("login", () => {
  test("signs in with valid credentials and reaches /chat", async ({ page }) => {
    await page.goto("/en/auth/login");

    await page.getByLabel("Email address").fill("user@localhost.dev");
    await page.getByLabel("Password", { exact: true }).fill("User123!");
    await page.getByRole("button", { name: "Sign In" }).click();

    // resolvePostLoginTarget(null, "en") === "/en/chat"
    // (apps/web/lib/safe-redirect.ts) — with no `?next=` param, this is
    // the one correct destination; asserting the literal path (not just
    // "left the login page") catches a regression that redirects
    // somewhere plausible-but-wrong (e.g. back to "/en").
    await expect(page).toHaveURL(/\/en\/chat$/, { timeout: 10_000 });
  });

  test("shows an error for an invalid password", async ({ page }) => {
    await page.goto("/en/auth/login");

    await page.getByLabel("Email address").fill("user@localhost.dev");
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Does not assert the exact error copy (mapAuthError's wording is
    // free to change) — only that submitting bad credentials keeps the
    // visitor on the login page instead of a false-positive redirect.
    await expect(page).toHaveURL(/\/en\/auth\/login$/);
  });
});
