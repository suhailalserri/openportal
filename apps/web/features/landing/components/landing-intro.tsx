import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/ui/reveal";

/**
 * apps/web/features/landing/components/landing-intro.tsx
 *
 * Phase 3.3. Short "what this is and who we are" section, per this
 * phase's plan. Static copy (messages/{ar,en}.json under landing.intro),
 * no data dependency — kept as its own file rather than folded into the
 * hero so it can be individually Reveal'd as the second thing a visitor
 * scrolls past.
 */
export async function LandingIntro({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
      <Reveal direction="up">
        <h2 className="t-h2 text-foreground">{t("intro.heading")}</h2>
        <p className="t-body mt-4 text-muted-foreground">{t("intro.body")}</p>
      </Reveal>
    </section>
  );
}
