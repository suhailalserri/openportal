import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LEGAL_DOCS } from "@/features/legal/lib/registry";

/**
 * apps/web/features/landing/components/landing-footer.tsx
 *
 * Legal links live only here and on the register page's consent
 * checkbox (Rule: "Legal documents live and linked in footer" — master
 * plan's Launch Checklist, still the right bar even post-rebuild).
 * Iterates LEGAL_DOCS (features/legal/lib/registry.ts) rather than
 * hardcoding three <Link>s, so a fourth document added to the registry
 * automatically appears here too.
 */
export async function LandingFooter({ locale }: { locale: string }) {
  const [t, tLegal] = await Promise.all([
    getTranslations({ locale, namespace: "landing" }),
    getTranslations({ locale, namespace: "legal" }),
  ]);

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-[12.5px] text-muted-foreground sm:flex-row sm:px-6">
        <p>
          {t("footerCopyright", { year: new Date().getFullYear() })}
        </p>
        <nav aria-label={t("legalNav")} className="flex items-center gap-4">
          {LEGAL_DOCS.map((doc) => (
            <Link key={doc.slug} href={`/${locale}/legal/${doc.slug}`} className="hover:text-foreground">
              {tLegal(doc.titleKey)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
