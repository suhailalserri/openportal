import { test, expect } from "@playwright/test";
import { balanceOf, hasDb, sql } from "./support/db";

/**
 * apps/web/e2e/manual-payment-approve.spec.ts (Phase 9.2a)
 *
 * The money path: a pending manual-transfer claim → admin approves in the
 * UI → the user's balance rises by exactly the package credits, ONCE, even
 * when the confirm button is double-clicked.
 *
 * Seeds its own package + payment method + claim via SQL (seed.ts has none
 * of these). Throwaway test DB only.
 *
 * Asserts a balance DELTA on user@localhost.dev, so run with --workers=1
 * (CI does) — another spec crediting/debiting that user at the same time
 * would break the delta.
 */
test.describe("manual payment approve", () => {
  test.use({
    storageState: "e2e/.auth/admin.json",
    extraHTTPHeaders: { "x-forwarded-for": "10.20.0.4" },
  });
  test.skip(!hasDb, "needs DATABASE_URL to seed the claim and read the balance");

  test("approving credits exactly once", async ({ page }) => {
    const credits = 25_000_000; // 25 display credits
    const ref = `E2E${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
    sql(
      `WITH pkg AS (
         INSERT INTO packages (name, name_ar, price_yer, price_usd_equivalent, credits)
         VALUES ('E2E package', 'باقة اختبار', 1000, 1.00, ${credits}) RETURNING id
       ), pm AS (
         INSERT INTO payment_methods (name, name_ar, type)
         VALUES ('E2E transfer', 'تحويل اختبار', 'manual_transfer') RETURNING id
       )
       INSERT INTO pending_manual_payments (user_id, package_id, payment_method_id, reference_code)
       SELECT u.id, pkg.id, pm.id, '${ref}' FROM users u, pkg, pm WHERE u.email = 'user@localhost.dev'`,
    );
    const before = balanceOf("user@localhost.dev");

    await page.goto("/en/admin/manual-payments");
    const row = page.getByRole("row").filter({ hasText: ref });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Approve" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Approve this payment?")).toBeVisible();
    // Double-click on purpose: the server's atomic pending→approved flip
    // plus disable-while-pending must make the second click a no-op.
    await dialog.getByRole("button", { name: "Approve" }).dblclick();

    await expect.poll(() => balanceOf("user@localhost.dev"), { timeout: 15_000 }).toBe(before + credits);
    await page.waitForTimeout(1_500);
    expect(balanceOf("user@localhost.dev")).toBe(before + credits);
    expect(sql(`SELECT status FROM pending_manual_payments WHERE reference_code = '${ref}'`)).toBe("approved");
    expect(sql(`SELECT count(*) FROM transactions WHERE type = 'payment' AND payment_id = (SELECT id::text FROM pending_manual_payments WHERE reference_code = '${ref}')`)).toBe("1");
  });
});
