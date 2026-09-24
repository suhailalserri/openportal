import { execFileSync } from "node:child_process";

/**
 * apps/web/e2e/support/db.ts (Phase 9.2a)
 *
 * Runs one SQL statement against DATABASE_URL via `psql` and returns the
 * trimmed single-value output. Uses psql (already required by the CI job's
 * migration step) instead of a Node Postgres client, so e2e adds no
 * dependency and no lockfile change. Only ever run against the throwaway
 * CI/local test database.
 */
export const hasDb = Boolean(process.env.DATABASE_URL);

export function sql(statement: string): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — e2e DB helpers need the test database.");
  return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], {
    encoding: "utf8",
  }).trim();
}

export function balanceOf(email: string): number {
  return Number(sql(`SELECT b.credits FROM balances b JOIN users u ON u.id = b.user_id WHERE u.email = '${email}'`));
}
