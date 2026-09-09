import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/src/test -> apps/api/src -> apps/api -> apps -> <repo root> -> packages/db
const DB_PACKAGE_DIR = path.resolve(__dirname, "../../../../packages/db");

let container: StartedPostgreSqlContainer | undefined;

/**
 * Boots a real, ephemeral PostgreSQL 16 container (via Testcontainers),
 * pushes the CURRENT Drizzle schema into it, and applies the hand-written
 * constraints/indexes/triggers from
 * packages/db/src/migrations/0001_constraints.sql — everything EXCEPT the
 * pg_cron block, since vanilla postgres images don't ship pg_cron and no
 * test here exercises scheduled jobs.
 *
 * IMPORTANT — import ordering:
 * packages/db/src/index.ts reads `process.env.DATABASE_URL` at MODULE LOAD
 * time and throws if it's unset. Static `import` statements are hoisted
 * above your code, so if you write:
 *
 *   import { db } from "@ai-platform/db";      // evaluated first — too early
 *   import { startTestDb } from "../test/testDb";
 *
 * `@ai-platform/db` will throw before startTestDb() ever runs. Every test
 * file in this suite MUST instead do:
 *
 *   let db: typeof import("@ai-platform/db").db;
 *   beforeAll(async () => {
 *     await startTestDb();
 *     ({ db } = await import("@ai-platform/db")); // dynamic — runs AFTER
 *   });
 *
 * Dynamic import() is not hoisted, so it only evaluates (and thus only
 * reads DATABASE_URL) once this line actually executes.
 */
export async function startTestDb(): Promise<void> {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("ai_platform_test")
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  // redeem.service.ts HMACs the code checksum with this — must be set
  // before that module (or anything importing it) is first evaluated.
  process.env.CODE_SALT ??= "test-salt-do-not-use-in-production";

  // 1. Push the current Drizzle schema. Deliberately NOT using pre-generated
  //    migration files (none exist yet in this repo) — `push` always
  //    reflects whatever is currently in packages/db/src/schema, so these
  //    tests can never silently drift from the real schema.
  execSync("npx drizzle-kit push --force", {
    cwd: DB_PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const postgres = (await import("postgres")).default;
  const sql = postgres(url, { max: 1 });

  try {
    // 2. Recreate the trigger function normally installed by
    //    infra/postgres/init.sql (skipped wholesale because that file also
    //    does `CREATE EXTENSION pg_cron`, unavailable on this image).
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 3. Apply 0001_constraints.sql minus the trailing pg_cron block.
    const constraintsPath = path.join(DB_PACKAGE_DIR, "src/migrations/0001_constraints.sql");
    const raw = fs.readFileSync(constraintsPath, "utf-8");
    const cronMarker = "-- ── CRON JOBS";
    const withoutCron = raw.includes(cronMarker) ? raw.split(cronMarker)[0]! : raw;
    await sql.unsafe(withoutCron);
  } finally {
    await sql.end();
  }
}

/**
 * Truncate all application tables between tests within the same file.
 * Keeps the container warm (no restart cost) while guaranteeing every
 * test starts from a clean slate — required for the concurrency tests,
 * where leftover rows from a previous test would corrupt balance math.
 */
export async function resetTestDb(): Promise<void> {
  if (!container) throw new Error("resetTestDb() called before startTestDb()");
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await sql.unsafe(`
      TRUNCATE TABLE
        audit_logs, provider_prices, fraud_events, models, messages,
        conversations, redeem_codes, transactions, balances, sessions, users
      RESTART IDENTITY CASCADE;
    `);
  } finally {
    await sql.end();
  }
}

export async function stopTestDb(): Promise<void> {
  await container?.stop();
  container = undefined;
}
