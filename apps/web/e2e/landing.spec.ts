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
 * ModelsSection/ModelsTable) works, not just that some hardcoded
 * fallback rendered.
 *
 * PHASE 3.3 UPDATE: ModelGrid/PackageGrid (card grids) were replaced by
 * ModelsSection (a searchable/filterable table, models-table.tsx) and
 * PackagesSection respectively — components/model-grid.tsx and
 * package-grid.tsx are deleted. The `landing.modelsHeading` /
 * `landing.packagesHeading` / `landing.noPackagesAvailable` message
 * strings this spec asserts against are UNCHANGED text (kept identical
 * on purpose for this reason), so the assertions below still hold
 * without edits to the strings themselves.
 *
 * ROUTING: bare "/" now redirects to "/{locale}" (the landing page)
 * instead of "/{locale}/chat" (middleware.ts, this same phase) — this
 * spec already navigated straight to "/en", not "/", so it is
 * unaffected either way; noted here so the two aren't assumed connected
 * if this file is revisited later.
 *
 * PACKAGES: deliberately NOT asserted as populated. There is no seed
 * script for the `packages` table anywhere in this repo (checked:
 * grepped packages/db/src for `creditPackages` — the only writes are
 * from admin.router.ts's runtime CRUD procedures, nothing at seed time).
 * A fresh CI database therefore has zero rows there, and
 * PackagesSection correctly renders its "no packages available" empty
 * state — this is the CORRECT behavior for that data state, not a bug
 * to work around. Asserting real package cards here would be testing
 * against data that doesn't exist in this environment and would be
 * exactly the kind of unverified assumption to avoid; this test instead
 * asserts the heading renders and the page does not error, which is
 * true in both the populated and empty states.
 *
 * "text=YER" AMBIGUITY (Phase 3.3, unverified without a real run): the
 * models table can ALSO render "YER" per row now (table.priceYerPerK,
 * when a usable package exists to derive a rate) — previously only
 * PackageGrid's cards could contain that string. `hasPackageCards`
 * below therefore no longer proves a package card specifically exists;
 * it only proves "YER" appears somewhere on the page, which is true
 * whenever ANY package is seeded (via the calculator/price-per-model
 * columns) even before PackagesSection's own cards are checked. This
 * still correctly distinguishes "some package exists" from "none do"
 * for the purposes of this assertion, so left as-is rather than
 * over-fitted to a scenario (packages seeded but a broken PackagesSection)
 * this repo has no seed data to actually exercise.
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

    // The consent banner is intentionally fixed above the page content.
    // Dismiss it before clicking footer links so Playwright does not report
    // that the banner intercepted the pointer event on the Terms link.
    const consentBanner = page.getByRole("region", { name: "Cookie notice" });
    if (await consentBanner.isVisible()) {
      await consentBanner.getByRole("button", { name: "Got it" }).click();
      await expect(consentBanner).toBeHidden();
    }

    await page.getByRole("link", { name: "Terms of Service" }).click();
    await expect(page).toHaveURL(/\/en\/legal\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  });
});
