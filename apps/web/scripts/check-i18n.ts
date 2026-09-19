#!/usr/bin/env tsx
/**
 * apps/web/scripts/check-i18n.ts
 *
 * Run via: pnpm exec tsx scripts/check-i18n.ts
 * (CI: .github/workflows/deploy.yml's `i18n-parity` job, cwd=apps/web —
 * presence of this file is what flips that job from a no-op to real.)
 *
 * Two checks:
 *  1. ar/en key PARITY — hard gate, nonzero exit on any mismatch.
 *  2. Unused-key scan — INFORMATIONAL ONLY, never fails the build.
 *     Deliberate: this exact 1.2 commit deletes every current consumer
 *     of these translation keys (app/[locale]/{admin,billing,auth,
 *     settings,chat}/**, components/{chat,shared,settings,billing}/**
 *     are all on the DELETE list). Every key would report "unused"
 *     right now — that's expected, not a regression, and keys come back
 *     into use as Phases 2-8 rebuild those features. Failing the build
 *     on that would make CI red for the wrong reason.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const MESSAGES_DIR = join(ROOT, "messages");

function flatten(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const nested of flatten(v as Record<string, unknown>, path)) keys.add(nested);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

function loadKeys(locale: string): Set<string> {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf-8");
  return flatten(JSON.parse(raw));
}

// ── 1. Parity (hard gate) ──────────────────────────────────────────────
const ar = loadKeys("ar");
const en = loadKeys("en");

const missingInEn = [...ar].filter((k) => !en.has(k)).sort();
const missingInAr = [...en].filter((k) => !ar.has(k)).sort();

let failed = false;

if (missingInEn.length > 0) {
  failed = true;
  console.error(`\n✗ ${missingInEn.length} key(s) in ar.json missing from en.json:`);
  missingInEn.forEach((k) => console.error(`  - ${k}`));
}
if (missingInAr.length > 0) {
  failed = true;
  console.error(`\n✗ ${missingInAr.length} key(s) in en.json missing from ar.json:`);
  missingInAr.forEach((k) => console.error(`  - ${k}`));
}

if (!failed) {
  console.log(`✓ ar/en key parity: ${ar.size} keys match.`);
}

// ── 2. Unused keys (informational only, see file header) ───────────────
function walk(dir: string, exts: string[], out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const SOURCE_DIRS = ["app", "components", "features", "providers", "lib", "config"].map((d) =>
  join(ROOT, d)
);
const sourceFiles = walk(SOURCE_DIRS[0]!, [".ts", ".tsx"])
  .concat(...SOURCE_DIRS.slice(1).map((d) => walk(d, [".ts", ".tsx"])))
  .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));

const sourceText = sourceFiles.map((f) => readFileSync(f, "utf-8")).join("\n");

const unused = [...ar].filter((key) => {
  const leaf = key.split(".").pop()!;
  return (
    !sourceText.includes(`"${key}"`) &&
    !sourceText.includes(`'${key}'`) &&
    !sourceText.includes(`"${leaf}"`) &&
    !sourceText.includes(`'${leaf}'`)
  );
});

if (unused.length > 0) {
  console.log(
    `\nℹ ${unused.length} key(s) have no detectable usage under app/components/features/providers/lib/config ` +
      `(informational only — not a CI failure; see file header).`
  );
}

process.exit(failed ? 1 : 0);
