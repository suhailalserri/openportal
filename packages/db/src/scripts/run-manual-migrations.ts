/**
 * Runner for the `packages/db/src/migrations/000N_*.sql` track.
 *
 * `0000_wandering_tana_nile.sql` is the only file drizzle-kit itself
 * owns (it's the one entry in migrations/meta/_journal.json, applied by
 * `pnpm db:migrate` / `drizzle-kit migrate`). Every file from `0001`
 * onward is a hand-written, previously psql-applied maintenance script
 * (indexes, constraints, RLS, column adds) — each file's own header
 * comment says "Execute with: psql $DATABASE_URL < ...". That's a
 * deliberate second track, not an oversight: these are mostly
 * `CREATE INDEX IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / a
 * `DO $$ ... EXCEPTION WHEN duplicate_object` guard around `CREATE TYPE`
 * / same-value `UPDATE`s — written so running one twice is harmless.
 *
 * That idempotency was the only safety net before this script: apply
 * order and "have I already run this one" were tracked by memory /
 * deploy-log scrollback, not by the database. This script replaces that
 * with a real tracking table, `_manual_migrations`, and only runs files
 * not yet recorded there, in filename order — i.e. it finds the actual
 * head and runs forward from it, instead of re-running the whole track
 * from scratch every time. Since the existing files are safe to re-run,
 * the very first invocation against an existing (e.g. production)
 * database that already had 0001-0009 applied by hand is *also* safe:
 * those statements no-op against the already-applied state, and then
 * get recorded so every future run skips straight to what's new.
 *
 * This intentionally does NOT touch drizzle-kit's own journal or the
 * `drizzle.__drizzle_migrations` table it manages for 0000 — those stay
 * exactly as they are. Two tracking tables, two tracks, matching the
 * two kinds of migration this repo already has.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @ai-platform/db db:migrate:manual
 *   DATABASE_URL=... pnpm --filter @ai-platform/db db:migrate:manual --dry-run
 *
 * Run `db:migrate` (drizzle-kit, for 0000) first on a brand-new database,
 * then this. On an existing database this is safe to run any time; it's
 * a no-op once every file is recorded.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

// 0000 is drizzle-kit's own file — owned by `db:migrate`, never re-run here.
const DRIZZLE_OWNED = /^0000_/;

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !DRIZZLE_OWNED.test(f))
    .sort(); // filenames are zero-padded (0001, 0002, ...), so lexical sort == numeric order

  if (files.length === 0) {
    console.log("No files found in the manual migration track.");
    return;
  }

  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    prepare: false,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _manual_migrations (
        filename   text PRIMARY KEY,
        hash       text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const appliedRows = await sql<{ filename: string; hash: string }[]>`
      SELECT filename, hash FROM _manual_migrations
    `;
    const applied = new Map(appliedRows.map((r) => [r.filename, r.hash]));

    const pending = files.filter((f) => !applied.has(f));

    // Flag (don't silently skip) a file whose content changed after it was
    // already recorded as applied — that's either a hand-edit of an old
    // migration (don't do that; add a new file instead) or drift the
    // person should know about before this runs anything.
    for (const f of files) {
      const recordedHash = applied.get(f);
      if (recordedHash === undefined) continue;
      const onDiskHash = sha256(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
      if (onDiskHash !== recordedHash) {
        throw new Error(
          `${f} is recorded as applied but its on-disk content has changed ` +
          `since then (hash mismatch). Refusing to run — add a new migration ` +
          `file for the change instead of editing an applied one.`
        );
      }
    }

    if (pending.length === 0) {
      console.log(`Up to date — all ${files.length} file(s) in the manual track are already applied.`);
      return;
    }

    const lastApplied = files.filter((f) => applied.has(f)).at(-1);
    console.log(
      `Current head: ${lastApplied ?? "(none applied yet)"}. ` +
      `Pending (${pending.length}): ${pending.join(", ")}`
    );

    for (const filename of pending) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const content = readFileSync(filePath, "utf8");
      const hash = sha256(content);

      if (dryRun) {
        console.log(`[dry-run] would apply ${filename}`);
        continue;
      }

      console.log(`Applying ${filename} ...`);
      // Each file runs in its own transaction: one bad file stops the run
      // without leaving a half-applied file recorded as done, and doesn't
      // block files before it (already committed) or require re-running
      // them once fixed.
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`
          INSERT INTO _manual_migrations (filename, hash) VALUES (${filename}, ${hash})
        `;
      });
      console.log(`  done.`);
    }

    console.log(dryRun ? "Dry run complete." : `Applied ${pending.length} file(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
