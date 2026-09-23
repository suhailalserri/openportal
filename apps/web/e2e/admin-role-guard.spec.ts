import { test, expect } from "@playwright/test";

/**
 * apps/web/e2e/admin-role-guard.spec.ts (Phase 9.2a)
 *
 * The (admin) layout guard: a signed-out visitor is sent to login, a
 * signed-in NON-admin is sent away from /admin. (Access is also enforced
 * server-side by adminProcedure; this covers the page guard.)
 */
test.describe("admin role guard", () => {
  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("is redirected to login", async ({ page }) => {
      await page.goto("/en/admin/users");
      await expect(page).toHaveURL(/\/en\/auth\/login/);
    });
  });

  test.describe("signed in as a regular user", () => {
    test.use({ storageState: "e2e/.auth/user.json" });

    test("cannot stay on /admin", async ({ page }) => {
      await page.goto("/en/admin/users");
      await expect(page).not.toHaveURL(/\/en\/admin/);
      await expect(page.getByRole("heading", { name: "Users", exact: true })).toHaveCount(0);
    });
  });
});
