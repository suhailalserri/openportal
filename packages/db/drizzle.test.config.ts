import { defineConfig } from "drizzle-kit";

/**
 * Used ONLY by apps/api/src/test/testDb.ts (`drizzle-kit push
 * --config=drizzle.test.config.ts`) against a throwaway Testcontainers
 * Postgres. Identical to drizzle.config.ts except `strict` and `verbose`
 * are off: `strict: true` makes push wait for an interactive
 * confirmation, which hangs forever in a non-interactive test run.
 * Never point this at a real database.
 */
export default defineConfig({
  schema:    "./src/schema/index.ts",
  out:       "./src/migrations",
  dialect:   "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: false,
  strict:  false,
});
