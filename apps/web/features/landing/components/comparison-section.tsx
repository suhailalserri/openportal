import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/ui/reveal";
import { ComparisonCards } from "./comparison-cards";

/**
 * apps/web/features/landing/components/comparison-section.tsx
 *
 * Phase 3.3+ (redesign). Section wrapper around <ComparisonCards>
 * (side-by-side cards) instead of <ComparisonTable> (a table). Same
 * five factual rows, same three columns.
 */
export async function ComparisonSection({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <h2 className="t-h2 mb-6 text-center text-foreground">
          {t("comparison.heading")}
        </h2>
      </Reveal>
      <Reveal direction="up" delay={0.1}>
        <ComparisonCards locale={locale} />
      </Reveal>
    </section>
  );
}