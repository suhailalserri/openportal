import { test, expect } from "@playwright/test";

/**
 * apps/web/e2e/admin-ops.spec.ts (Phase 8c)
 *
 * Route smoke for the five ops screens: each renders behind the admin
 * guard with its page heading. Read-only — clicks nothing that mutates
 * (no Publish/Resolve/Clear). `/admin/channels` calls the gateway, which
 * isn't reachable in CI (GATEWAY_URL is a placeholder), so it renders its
 * error state there — only the heading is asserted.
 */
test.describe("admin ops", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  const pages: Array<[string, string]> = [
    ["/en/admin/models", "Models"],
    ["/en/admin/channels", "Channels"],
    ["/en/admin/fraud", "Fraud"],
    ["/en/admin/logs", "Usage logs"],
    ["/en/admin/audit", "Audit log"],
  ];

  for (const [path, heading] of pages) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    });
  }
});
