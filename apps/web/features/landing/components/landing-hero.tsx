import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import { CtaButton } from "@/components/ui/cta-button";
import { TextAnimate } from "@/components/ui/text-animate";

/**
 * apps/web/features/landing/components/landing-hero.tsx
 *
 * Phase 3.3. Primary CTA is CtaButton (Sign up only — Sign in stays
 * a plain outline button, so the shimmer draws the eye to the one action
 * that matters here, not both equally).
 *
 * The constellation canvas is NO LONGER mounted here — it moved to a
 * single page-root instance in index.tsx (`<ConstellationBackground />`,
 * `position: fixed`, behind every section) so the dot field spans the
 * whole page instead of stopping at the bottom of the hero. This
 * section no longer needs its own `relative overflow-hidden` stacking
 * context for that purpose, but keeps `relative` since the pill/heading
 * still sit above the global fixed background by normal stacking order
 * (a `position: fixed` element behind content needs no z-index dance
 * from content that is simply in normal flow above it).
 */
export async function LandingHero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section className="relative">
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <Reveal direction="up">
          <div className="mb-6 inline-flex rounded-full border border-border bg-card/70 backdrop-blur-sm">
            <AnimatedShinyText className="px-4 py-1 text-[13px]">{t("heroPill")}</AnimatedShinyText>
          </div>
        </Reveal>
        <TextAnimate as="h1" className="t-h1 mx-auto block max-w-3xl text-balance text-foreground">
          {t("heroTitle")}
        </TextAnimate>
        <Reveal direction="up" delay={0.1}>
          <p className="t-body mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
            {t("heroSubtitle")}
          </p>
        </Reveal>
        <Reveal direction="up" delay={0.2}>
          <div className="mt-8 flex items-center justify-center gap-3">
            <CtaButton asChild size="lg">
              <Link href={`/${locale}/auth/register`}>{t("heroCta")}</Link>
            </CtaButton>
            <Button size="lg" variant="outline" asChild>
              <Link href={`/${locale}/auth/login`}>{t("signIn")}</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
