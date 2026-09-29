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
  // packages/db forces TLS unless DATABASE_SSL=disable; the container has
  // none. Also set in vitest.config.ts — repeated here so it holds even if
  // a test is run with a different config. Must precede any import of
  // "@ai-platform/db" (which builds its client at module load).
  process.env.DATABASE_SSL = "disable";
  // redeem.service.ts HMACs the code checksum with this — must be set
  // before that module (or anything importing it) is first evaluated.
  process.env.CODE_SALT ??= "test-salt-do-not-use-in-production";

  // 1. Push the current Drizzle schema. Deliberately NOT using pre-generated
  //    migration files — `push` always reflects whatever is currently in
  //    packages/db/src/schema, so these tests can never silently drift.
  //
  //    IMPORTANT — why a separate config (drizzle.test.config.ts):
  //    the real drizzle.config.ts sets `strict: true`, which makes push
  //    print its SQL and ASK FOR CONFIRMATION before executing — on every
  //    run, even against an empty database (an earlier version of this
  //    comment claimed otherwise; that was wrong). With stdin set to
  //    "ignore" nobody can ever answer, but push keeps its DB connection
  //    open, so the child process never exits. And because execSync BLOCKS
  //    the event loop, vitest's hookTimeout timer can't fire either — the
  //    whole test file hangs silently forever (seen in CI: 10+ min, no
  //    output). The test config is identical except strict/verbose off.
  //    (`--force` isn't an option: it only exists in drizzle-kit >= 0.23,
  //    and this repo's lockfile pins 0.22.8.)
  //
  //    `timeout` is the safety net: if push ever hangs again for any other
  //    reason, it is killed after 2 min and the captured output is thrown,
  //    so CI fails fast WITH the reason instead of hanging.
  try {
    execSync("npx drizzle-kit push --config=drizzle.test.config.ts", {
      cwd: DB_PACKAGE_DIR,
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
      killSignal: "SIGKILL",
    });
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    throw new Error(
      `drizzle-kit push failed or timed out (120s).\n${e.message ?? ""}\n` +
        `--- stdout ---\n${e.stdout?.toString() ?? ""}\n--- stderr ---\n${e.stderr?.toString() ?? ""}`,
    );
  }

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

    // 4. Apply 0018 (P1.1): the trigger that deletes a user's sessions when
    //    they become suspended / fraud-flagged. Read from the real migration
    //    file so the test exercises exactly what production runs.
    const lockoutPath = path.join(DB_PACKAGE_DIR, "src/migrations/0018_revoke_sessions_on_lockout.sql");
    await sql.unsafe(fs.readFileSync(lockoutPath, "utf-8"));
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
        conversations, pending_manual_payments, redeem_codes, packages,
        payment_methods, transactions, balances, sessions, users
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
