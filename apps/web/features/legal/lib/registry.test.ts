import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { LEGAL_DOCS, isLegalDocSlug, getLegalDocMeta } from "./registry";

/**
 * apps/web/features/legal/lib/registry.test.ts
 *
 * Phase 3.2. Follows the same pattern as config/nav.test.ts (this repo's
 * existing convention for a "pure module + integrity checks against the
 * message files and filesystem" test) — registry.ts has zero imports of
 * its own, same as safe-redirect.ts, so this loads cleanly under vitest
 * without needing the `@/` alias.
 */
const WEB_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function loadLegalMessages(locale: "ar" | "en"): Record<string, unknown> {
  const raw = readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf-8");
  return (JSON.parse(raw) as { legal: Record<string, unknown> }).legal;
}

describe("LEGAL_DOCS registry integrity", () => {
  it("slugs are unique", () => {
    const slugs = LEGAL_DOCS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(["ar", "en"] as const)(
    "every titleKey exists in messages/%s.json's legal namespace",
    (locale) => {
      const legal = loadLegalMessages(locale);
      for (const doc of LEGAL_DOCS) {
        expect(typeof legal[doc.titleKey], `legal.${doc.titleKey} (${doc.slug})`).toBe("string");
      }
    }
  );

  it("every registered doc has a synced content file (content/legal/<slug>.md)", () => {
    for (const doc of LEGAL_DOCS) {
      const path = join(WEB_ROOT, "content", "legal", `${doc.slug}.md`);
      expect(existsSync(path), `content/legal/${doc.slug}.md is missing — run "pnpm run sync-legal"`).toBe(
        true
      );
    }
  });

  it("covers exactly the three documents named in the master plan's Launch Checklist (ToS, Privacy, AUP) — no more, no fewer", () => {
    // Deliberately NOT PROVIDER_TOS_COMPLIANCE.md — see sync-legal.ts's
    // own header comment for why that one stays internal.
    expect(LEGAL_DOCS.map((d) => d.slug).sort()).toEqual(["acceptable-use", "privacy", "terms"]);
  });
});

describe("isLegalDocSlug", () => {
  it("accepts every registered slug", () => {
    for (const doc of LEGAL_DOCS) {
      expect(isLegalDocSlug(doc.slug)).toBe(true);
    }
  });

  it.each(["", "TERMS", "terms-of-service", "privacy-policy", "random"])(
    "rejects %p",
    (value) => {
      expect(isLegalDocSlug(value)).toBe(false);
    }
  );
});

describe("getLegalDocMeta", () => {
  it("returns the matching entry for a valid slug", () => {
    expect(getLegalDocMeta("terms")?.titleKey).toBe("termsTitle");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getLegalDocMeta("not-a-real-doc")).toBeUndefined();
  });
});
