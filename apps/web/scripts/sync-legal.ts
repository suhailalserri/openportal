#!/usr/bin/env tsx
/**
 * apps/web/scripts/sync-legal.ts
 *
 * Phase 3.2 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * Copies the three governing legal documents from docs/legal/ (repo root)
 * into apps/web/content/legal/ so `features/legal` can render them without
 * reaching outside the Next.js app's own directory at build/runtime.
 *
 * WHY A COPY, NOT A SYMLINK OR RELATIVE IMPORT: Vercel builds apps/web as
 * an isolated deployment — the plan's own 3.2 line says this explicitly
 * ("Vercel builds may not see `../../docs`"). A symlink would resolve
 * correctly in a full monorepo checkout (this sandbox, GitHub Actions) but
 * silently break or vanish under Vercel's file-tracing, which decides what
 * to include in a serverless bundle by statically analyzing `import`/`fs`
 * calls — it cannot see a Node script that ran before the build and
 * decided to symlink something. A plain committed copy has no such
 * ambiguity: it's just a file that exists in the repo at build time.
 *
 * TWO MODES:
 *   pnpm exec tsx scripts/sync-legal.ts          → writes the copies
 *   pnpm exec tsx scripts/sync-legal.ts --check  → verifies copies match
 *     source exactly (byte-for-byte after normalizing line endings) and
 *     exits 1 with a diff-style message if not. This is what CI's
 *     `web-build` job runs (new step, before `next build`) — a stale copy
 *     must fail the build loudly, not ship a legal document that silently
 *     diverged from the version docs/legal/*.md (and whoever reviews that
 *     folder) actually approved.
 *
 * Source of truth for filenames: FRONTEND_REBUILD_PLAN.md §0.1 keeps the
 * existing docs/legal/*.md names (TERMS_OF_SERVICE.md etc — the gate
 * checks content, not filename). Destination slugs match the /legal/[doc]
 * route segments features/legal's registry uses (terms, privacy,
 * acceptable-use) rather than re-using the shouting-case source names, so
 * the public URL is /ar/legal/terms, not /ar/legal/TERMS_OF_SERVICE.
 *
 * PROVIDER_TOS_COMPLIANCE.md is deliberately NOT copied here — it is an
 * internal compliance-tracking document (Phase 0 of the master plan), not
 * one of the three user-facing documents the register-page checkbox and
 * footer link to. Nothing in the plan asks for it to be public.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const WEB_ROOT = join(__dirname, "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..");
const SOURCE_DIR = join(REPO_ROOT, "docs", "legal");
const DEST_DIR = join(WEB_ROOT, "content", "legal");

const DOCS: Array<{ source: string; slug: string }> = [
  { source: "TERMS_OF_SERVICE.md", slug: "terms" },
  { source: "PRIVACY_POLICY.md", slug: "privacy" },
  { source: "ACCEPTABLE_USE_POLICY.md", slug: "acceptable-use" },
];

/** Normalizes line endings only — never touches content, so a real
 * wording drift is never masked as a "just CRLF" false negative. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

const checkMode = process.argv.includes("--check");

if (!existsSync(SOURCE_DIR)) {
  console.error(`✗ Source directory not found: ${SOURCE_DIR}`);
  console.error(
    "  (sync-legal.ts expects to run from apps/web, with docs/legal/ two levels up — " +
      "if the repo layout changed, update REPO_ROOT above.)"
  );
  process.exit(1);
}

let failed = false;

for (const { source, slug } of DOCS) {
  const sourcePath = join(SOURCE_DIR, source);
  const destPath = join(DEST_DIR, `${slug}.md`);

  if (!existsSync(sourcePath)) {
    console.error(`✗ Missing source doc: docs/legal/${source}`);
    failed = true;
    continue;
  }

  const sourceContent = normalize(readFileSync(sourcePath, "utf-8"));

  if (checkMode) {
    if (!existsSync(destPath)) {
      console.error(
        `✗ content/legal/${slug}.md does not exist. Run "pnpm exec tsx scripts/sync-legal.ts" (no --check) and commit the result.`
      );
      failed = true;
      continue;
    }
    const destContent = normalize(readFileSync(destPath, "utf-8"));
    if (destContent !== sourceContent) {
      console.error(
        `✗ content/legal/${slug}.md is out of sync with docs/legal/${source}.\n` +
          `  Run "pnpm exec tsx scripts/sync-legal.ts" (no --check) and commit the result.`
      );
      failed = true;
      continue;
    }
    console.log(`✓ content/legal/${slug}.md matches docs/legal/${source}`);
  } else {
    mkdirSync(DEST_DIR, { recursive: true });
    writeFileSync(destPath, sourceContent, "utf-8");
    console.log(`✓ Copied docs/legal/${source} → apps/web/content/legal/${slug}.md`);
  }
}

process.exit(failed ? 1 : 0);
