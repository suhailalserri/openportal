import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { ShimmerButton } from "@/components/ui/shimmer-button";

import { ConstellationBackground } from "./constellation-background";

/**
 * apps/web/features/landing/components/landing-hero.tsx
 *
 * Phase 3.3. Adds the constellation canvas background and switches the
 * primary CTA from Button to ShimmerButton (Sign up only — Sign in stays
 * a plain outline button, so the shimmer draws the eye to the one action
 * that matters here, not both equally).
 *
 * The canvas sits absolutely behind the text (z-0), text is z-10 with a
 * relative wrapper — same section, same copy, same links as 3.2, this
 * only adds the visual layer and the entrance animation.
 */
export async function LandingHero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section className="relative overflow-hidden">
      <ConstellationBackground />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <Reveal direction="up">
          <h1 className="t-h1 mx-auto max-w-3xl text-balance text-foreground">{t("heroTitle")}</h1>
        </Reveal>
        <Reveal direction="up" delay={0.1}>
          <p className="t-body mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
            {t("heroSubtitle")}
          </p>
        </Reveal>
        <Reveal direction="up" delay={0.2}>
          <div className="mt-8 flex items-center justify-center gap-3">
            <ShimmerButton asChild size="lg">
              <Link href={`/${locale}/auth/register`}>{t("heroCta")}</Link>
            </ShimmerButton>
            <Button size="lg" variant="outline" asChild>
              <Link href={`/${locale}/auth/login`}>{t("signIn")}</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
