import { test, expect } from "@playwright/test";

/**
 * apps/web/e2e/landing.spec.ts
 *
 * Phase 3.2 (docs/FRONTEND_REBUILD_PLAN.md). Exists specifically to
 * de-risk the tRPC-server-caller change in lib/trpc-server.ts: a
 * type-check passing does NOT prove the landing page actually renders
 * real data from a real database at runtime — this test does.
 *
 * MODELS: the CI `e2e` job runs `pnpm --filter @ai-platform/db exec tsx
 * src/seed-models.ts` (after db:migrate, alongside db:seed) — see
 * seed-models.ts, which inserts every entry of
 * @ai-platform/config's MODEL_CATALOG with status="published" (the
 * models table's column default — see packages/db/src/schema/models.ts)
 * and isAvailable=true (MODEL_CATALOG["gpt-4o"].isAvailable, on a first
 * insert). "GPT-4o" is MODEL_CATALOG's first entry's displayName,
 * verified verbatim against packages/config/src/models.config.ts — not
 * a guessed model name. modelsRouter.list only returns
 * status="published" AND isAvailable=true rows, so this model appearing
 * on the page proves the full path (seed → DB → tRPC caller →
 * ModelGrid) works, not just that some hardcoded fallback rendered.
 *
 * PACKAGES: deliberately NOT asserted as populated. There is no seed
 * script for the `packages` table anywhere in this repo (checked:
 * grepped packages/db/src for `creditPackages` — the only writes are
 * from admin.router.ts's runtime CRUD procedures, nothing at seed time).
 * A fresh CI database therefore has zero rows there, and
 * PackageGrid correctly renders its "no packages available" empty state
 * — this is the CORRECT behavior for that data state, not a bug to work
 * around. Asserting real package cards here would be testing against
 * data that doesn't exist in this environment and would be exactly the
 * kind of unverified assumption to avoid; this test instead asserts the
 * heading renders and the page does not error, which is true in both
 * the populated and empty states.
 */
test.describe("landing page", () => {
  test("renders live model data from the database", async ({ page }) => {
    await page.goto("/en");

    await expect(page.getByRole("heading", { name: "Available models" })).toBeVisible();
    await expect(page.getByText("GPT-4o", { exact: true })).toBeVisible();
  });

  test("renders the packages section without erroring, even with none seeded", async ({ page }) => {
    await page.goto("/en");

    await expect(page.getByRole("heading", { name: "Top-up packages" })).toBeVisible();
    // Either real package cards OR the empty-state message is correct —
    // this only guards against the section crashing/being blank.
    const hasEmptyState = await page.getByText("No packages are available right now").isVisible();
    const hasPackageCards = (await page.locator("text=YER").count()) > 0;
    expect(hasEmptyState || hasPackageCards).toBe(true);
  });

  test("legal footer links navigate to the correct documents", async ({ page }) => {
    await page.goto("/en");

    await page.getByRole("link", { name: "Terms of Service" }).click();
    await expect(page).toHaveURL(/\/en\/legal\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  });
});
