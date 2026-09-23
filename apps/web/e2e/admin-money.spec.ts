import { test, expect } from "@playwright/test";

/**
 * apps/web/e2e/admin-money.spec.ts (Phase 8b)
 *
 * Smoke coverage for the four money-ops screens this phase adds:
 * codes, packages, payment methods, manual payments. Deliberately NOT
 * exhaustive — this proves each route renders behind the admin guard
 * and its primary "create" affordance opens, not every CRUD path (that
 * would need seeded fixture rows per screen, which packages/db/src/
 * seed.ts doesn't currently provide for packages/payment-methods/
 * manual-payment claims). Follows login.spec.ts's pattern: `/en` only,
 * accessible-name selectors from the "en" message file, admin
 * credentials from seed.ts ("admin@localhost.dev" / "Admin123!").
 *
 * ⚠️ Same caveat as the rest of this phase: the "approve" action on
 * /admin/manual-payments moves real balance via `creditBalance` — this
 * spec does NOT click Approve/Reject/Revoke on any row, only asserts
 * the screens render and dialogs open, to avoid mutating whatever data
 * exists in whatever DB this suite runs against (see
 * docs/frontend/BRANCH_AND_CI_NOTES.md's 8b entry for the fuller
 * warning about preview/test-account use of these actions).
 */
test.describe("admin money ops", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/auth/login");
    await page.getByLabel("Email address").fill("admin@localhost.dev");
    await page.getByLabel("Password").fill("Admin123!");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/en\/chat/);
  });

  test("codes: batches list renders and generate dialog opens", async ({ page }) => {
    await page.goto("/en/admin/codes");
    await expect(page.getByRole("heading", { name: "Redeem codes" })).toBeVisible();
    await page.getByRole("button", { name: "Generate codes" }).first().click();
    await expect(page.getByLabel("Batch label")).toBeVisible();
  });

  test("packages: list renders and new-package dialog opens", async ({ page }) => {
    await page.goto("/en/admin/packages");
    await expect(page.getByRole("heading", { name: "Packages" })).toBeVisible();
    await page.getByRole("button", { name: "New package" }).click();
    await expect(page.getByLabel("Name (English)")).toBeVisible();
  });

  test("payment methods: list renders and new-method dialog opens", async ({ page }) => {
    await page.goto("/en/admin/payment-methods");
    await expect(page.getByRole("heading", { name: "Payment methods" })).toBeVisible();
    await page.getByRole("button", { name: "New method" }).click();
    await expect(page.getByLabel("Name (English)")).toBeVisible();
  });

  test("manual payments: claims queue renders with status tabs", async ({ page }) => {
    await page.goto("/en/admin/manual-payments");
    await expect(page.getByRole("heading", { name: "Manual payments" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Pending" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Approved" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Rejected" })).toBeVisible();
  });
});
