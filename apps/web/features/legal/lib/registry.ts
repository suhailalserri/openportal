/**
 * apps/web/features/legal/lib/registry.ts
 *
 * Phase 3.2 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * Single source of truth for which legal documents exist, their URL
 * slugs, and their titleKey (i18n `legal` namespace). The route
 * (app/[locale]/(public)/legal/[doc]/page.tsx) uses this both to render
 * and to `notFound()` any slug not listed here, and to pre-generate
 * static params so /legal/terms etc. are static, not dynamically
 * rendered per-request (the content never changes without a deploy —
 * sync-legal.ts is a build-time step, not a runtime read).
 *
 * Pure module (no React, no next-intl) so it can be unit-tested and
 * imported from both the page and any nav/footer link builder.
 */
export type LegalDocSlug = "terms" | "privacy" | "acceptable-use";

export interface LegalDocMeta {
  slug: LegalDocSlug;
  /** Key in the `legal` message namespace for the document's title. */
  titleKey: "termsTitle" | "privacyTitle" | "acceptableUseTitle";
}

export const LEGAL_DOCS: readonly LegalDocMeta[] = [
  { slug: "terms", titleKey: "termsTitle" },
  { slug: "privacy", titleKey: "privacyTitle" },
  { slug: "acceptable-use", titleKey: "acceptableUseTitle" },
];

export function isLegalDocSlug(value: string): value is LegalDocSlug {
  return LEGAL_DOCS.some((doc) => doc.slug === value);
}

export function getLegalDocMeta(slug: string): LegalDocMeta | undefined {
  return LEGAL_DOCS.find((doc) => doc.slug === slug);
}
