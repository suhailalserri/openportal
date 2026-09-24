import { test, expect } from "@playwright/test";
import { hasDb, sql } from "./support/db";

/**
 * apps/web/e2e/chat-stream.spec.ts (Phase 9.2a)
 *
 * The real chat path against the mock gateway: browser → web /api/chat →
 * apps/api /chat (Redis + Postgres) → mock gateway SSE → streamed text →
 * exactly ONE usage_debit row. Needs the API + mock gateway webServers
 * from playwright.config.ts and a seeded user with credits.
 */
test.describe("chat stream", () => {
  test.use({
    storageState: "e2e/.auth/user.json",
    // Own rate-limit bucket (see auth.setup.ts note) — harmless if unused.
    extraHTTPHeaders: { "x-forwarded-for": "10.20.0.1" },
  });
  test.skip(!hasDb, "needs DATABASE_URL to verify billing");

  test("streams the mock reply and bills once", async ({ page }) => {
    const debits = () =>
      Number(sql(`SELECT count(*) FROM transactions t JOIN users u ON u.id = t.user_id WHERE u.email = 'user@localhost.dev' AND t.type = 'usage_debit'`));
    const before = debits();

    await page.goto("/en/chat");
    await page.getByPlaceholder("Type your message...").fill("say hello");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Hello from the mock gateway.")).toBeVisible({ timeout: 20_000 });

    // Billing runs after the stream closes; poll instead of sleeping.
    await expect.poll(debits, { timeout: 15_000 }).toBe(before + 1);
    // ...and stays at exactly +1 (no double charge).
    await page.waitForTimeout(1_500);
    expect(debits()).toBe(before + 1);
  });
});
