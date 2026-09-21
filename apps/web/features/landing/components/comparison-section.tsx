import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/ui/reveal";

import { ComparisonTable } from "./comparison-table";

/**
 * apps/web/features/landing/components/comparison-section.tsx
 *
 * Phase 3.3. Section wrapper around the static ComparisonTable.
 */
export async function ComparisonSection({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <h2 className="t-h2 mb-6 text-center text-foreground">{t("comparison.heading")}</h2>
      </Reveal>
      <Reveal direction="up" delay={0.1}>
        <ComparisonTable locale={locale} />
      </Reveal>
    </section>
  );
}
