import { test, expect } from "@playwright/test";
import { balanceOf, hasDb, sql } from "./support/db";

/**
 * apps/web/e2e/redeem.spec.ts (Phase 9.2a)
 *
 * Redeems a seeded code (seed.ts inserts 5 `seed-batch` codes worth 50
 * credits each, with valid checksums for the job's CODE_SALT) and asserts
 * the balance rises by exactly that amount ONCE; a second attempt with the
 * same code is rejected and the balance does not move.
 */
test.describe("redeem", () => {
  test.use({
    storageState: "e2e/.auth/user.json",
    extraHTTPHeaders: { "x-forwarded-for": "10.20.0.2" },
  });
  test.skip(!hasDb, "needs DATABASE_URL to read a seeded code and the balance");

  test("credits once, rejects the reuse", async ({ page }) => {
    const code = sql(`SELECT code FROM redeem_codes WHERE batch_label = 'seed-batch' AND status = 'unused' ORDER BY code LIMIT 1`);
    expect(code, "no unused seed-batch code — was `pnpm --filter @ai-platform/db seed` run?").not.toBe("");
    const amount = Number(sql(`SELECT credit_amount FROM redeem_codes WHERE code = '${code}'`));
    const before = balanceOf("user@localhost.dev");

    await page.goto("/en/billing");
    const input = page.getByPlaceholder("e.g. XXXX-XXXX-XXXX-XXXX");
    // The clipboard-paste icon button is ALSO named "Redeem" (aria-label);
    // only the type=submit one submits the form.
    const submit = page.getByRole("button", { name: "Redeem", exact: true }).and(page.locator('[type="submit"]'));
    await input.fill(code);
    await submit.click();

    await expect.poll(() => balanceOf("user@localhost.dev"), { timeout: 15_000 }).toBe(before + amount);

    // Same code again → rejected, balance unchanged.
    await input.fill(code);
    await submit.click();
    await expect(page.getByRole("alert").filter({ hasText: "already been used" })).toBeVisible();
    expect(balanceOf("user@localhost.dev")).toBe(before + amount);
  });
});
