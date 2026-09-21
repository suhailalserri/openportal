import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/ui/cta-button";

/**
 * apps/web/features/landing/components/landing-header.tsx
 *
 * Server Component — no session read here (Rule 4: server layouts guard,
 * this page isn't gated at all). Sign in / Register always point at the
 * (auth) routes; decideAuthGuard (lib/guards.ts) already bounces an
 * already-signed-in visitor away from those pages to /chat, so this
 * header doesn't need its own signed-in-state branch to stay correct.
 *
 * Reuses LanguageSwitcher/ThemeToggle from Phase 2.2 rather than
 * building new ones — both are already locale- and direction-aware.
 */
export async function LandingHeader({ locale }: { locale: string }) {
  const [t, tApp] = await Promise.all([
    getTranslations({ locale, namespace: "landing" }),
    getTranslations({ locale, namespace: "app" }),
  ]);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href={`/${locale}`} className="t-h3 text-foreground">
          {tApp("name")}
        </Link>

        <nav aria-label={t("primaryNav")} className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/${locale}/auth/login`}>{t("signIn")}</Link>
          </Button>
          <CtaButton size="default" asChild>
            <Link href={`/${locale}/auth/register`}>{t("getStarted")}</Link>
          </CtaButton>
        </nav>
      </div>
    </header>
  );
}
