/**
 * apps/web/features/legal/lib/read-doc.ts
 *
 * Server-only: reads a synced legal document from apps/web/content/legal/
 * (populated by scripts/sync-legal.ts — see that file's header for why a
 * committed copy, not a symlink or a `../../docs` import, is used).
 *
 * `readFileSync` + `node:fs`/`node:path` — never imported from a client
 * component. The route (page.tsx, a Server Component) is the only caller.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { LegalDocSlug } from "./registry";

const CONTENT_DIR = join(process.cwd(), "content", "legal");

/**
 * Returns the raw markdown for `slug`, or null if the synced file is
 * missing (e.g. sync-legal.ts hasn't run yet in a fresh checkout — this
 * lets the page render a clear "not available" state instead of a build
 * crash, while CI's `sync-legal --check` step is the actual hard gate
 * that prevents a stale/missing doc from reaching production).
 */
export function readLegalDoc(slug: LegalDocSlug): string | null {
  try {
    return readFileSync(join(CONTENT_DIR, `${slug}.md`), "utf-8");
  } catch {
    return null;
  }
}
