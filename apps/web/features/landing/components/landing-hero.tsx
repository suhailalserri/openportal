import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/ui/cta-button";
import { cn } from "@/lib/utils";
import type { CalculatorView } from "@/features/landing/types";

import { HeroCalculator } from "./hero-calculator";

/**
 * apps/web/features/landing/components/landing-hero.tsx
 *
 * Phase 3.3+ (redesign). Two-column hero: identity and CTA on the left,
 * a live calculator on the right. The calculator is the primary proof
 * that "pay only for what you use" is not marketing copy — a visitor
 * sees their balance stretch across 300+ messages before reading a
 * single paragraph of prose.
 *
 * GRACEFUL DEGRADATION: when `calculator` is null (no usable package to
 * derive a YER rate from, or no models published), the right column
 * disappears and the left column centers itself. The hero is still a
 * complete, usable hero without the calculator — the redesign assumes
 * the common case (models + packages exist) but does not break when it
 * is not the case.
 *
 * No `isAuthenticated` branch: the landing is public and always shows
 * the same CTA. The app-shell's own header handles signed-in users.
 */
export async function LandingHero({
  locale,
  calculator,
}: {
  locale: string;
  calculator: CalculatorView | null;
}) {
  const t = await getTranslations({ locale, namespace: "landing" });
  const hasCalculator = calculator !== null;

  const trustLabels = [t("hero.trust1"), t("hero.trust2"), t("hero.trust3")];

  return (
    <section className="relative z-10 px-4 pt-32 pb-16 sm:px-6 md:pt-40 md:pb-24">
      <div
        className={cn(
          "mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:gap-16",
          hasCalculator ? "items-center lg:grid-cols-12" : "max-w-3xl",
        )}
      >
        {/* ── Left column ─────────────────────────────────────────── */}
        <div
          className={cn(
            "flex flex-col",
            hasCalculator
              ? "items-start text-left lg:col-span-6"
              : "items-center text-center",
          )}
        >
          {/* Pill badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            <span>{t("hero.pill")}</span>
          </div>

          <h1 className="text-balance text-4xl leading-[1.08] font-semibold tracking-tight text-foreground sm:text-5xl md:text-[56px]">
            {t("hero.title1")}
            <br />
            <em className="bg-gradient-to-r from-chart-1 via-chart-4 to-destructive bg-clip-text font-normal text-transparent italic">
              {t("hero.title2")}
            </em>
            <br />
            {t("hero.title3")}
          </h1>

          <p className="mt-6 max-w-xl text-balance text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            {t("hero.subtitle")}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <CtaButton asChild size="lg">
              {/* scroll={false}: this opens the /auth/register intercepted
                  modal route on top of this same landing page (see
                  app/[locale]/@modal) — it is not a real page navigation.
                  Next's <Link> scrolls the viewport by default on every
                  navigation (App Router's post-navigation router.scroll()),
                  which on a long landing page like this one jumps the
                  visible viewport away from wherever the visitor actually
                  clicked. The modal overlay is `position: fixed` and
                  covers the viewport regardless of scroll position, so
                  there is nothing for that default scroll to usefully do
                  here — only harm. */}
              <Link href={`/${locale}/auth/register`} scroll={false}>
                {t("hero.ctaPrimary")}
              </Link>
            </CtaButton>
            <Button variant="outline" size="lg" asChild>
              <Link href="#models">{t("hero.ctaSecondary")}</Link>
            </Button>
          </div>

          {/* Trust row */}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-6">
            {trustLabels.map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 text-[12px] text-muted-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5 shrink-0 text-success"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right column — the live calculator ──────────────────── */}
        {hasCalculator ? (
          <div className="w-full lg:col-span-6">
            <HeroCalculator view={calculator} />
          </div>
        ) : null}
      </div>
    </section>
  );
}