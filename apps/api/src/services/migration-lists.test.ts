import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guard: the raw-SQL migrations are applied by hand-written loops in two workflows (the E2E job's
 * throwaway database and db-ops "constraints"). Those loops do not discover files, and nothing kept them in
 * sync: 0021-0023 were forgotten, so the E2E database lacked platform_config.feature_* and every chat
 * request failed there ("column does not exist"). This test makes a forgotten file a red build.
 *
 * Not listed on purpose: 0000 (applied by drizzle-kit migrate) and 0007/0008 (Supabase-only hardening,
 * meaningless on a plain database).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATIONS = path.join(ROOT, "packages/db/src/migrations");
const NOT_LISTED = new Set(["0000_wandering_tana_nile", "0007_enable_rls", "0008_fix_function_search_path"]);

const onDisk = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.+\.sql$/.test(f)).map((f) => f.replace(/\.sql$/, "")).sort();

function listIn(workflow: string): string[] {
  const text = fs.readFileSync(path.join(ROOT, ".github/workflows", workflow), "utf-8").replace(/\\\r?\n/g, " ");
  const loops = [...text.matchAll(/for f in ([^;]+);\s*do/g)].map((m) => m[1]!.trim().split(/\s+/)).filter((names) => names.includes("0001_constraints"));
  expect(loops, `${workflow}: no "for f in 0001_constraints ..." loop found`).toHaveLength(1);
  return loops[0]!;
}

describe.each(["deploy.yml", "db-ops.yml"])("raw SQL migration list in %s", (workflow) => {
  const listed = listIn(workflow);

  it("contains every migration file except the deliberate exclusions", () => {
    const missing = onDisk.filter((f) => !NOT_LISTED.has(f) && !listed.includes(f));
    expect(missing, `${workflow} is missing: ${missing.join(", ")}. Add the name to the loop (same PR as the migration).`).toEqual([]);
  });

  it("names only files that exist, with no duplicates", () => {
    expect(listed.filter((n) => !onDisk.includes(n)), "listed but no such file").toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("is in ascending order (a later file may depend on an earlier one)", () => {
    expect(listed).toEqual([...listed].sort());
  });
});

describe("the guard itself", () => {
  it("sees a realistic number of migrations (cannot pass vacuously)", () => {
    expect(onDisk.length).toBeGreaterThan(20);
    expect(onDisk).toContain("0023_feature_flags");
  });
});
