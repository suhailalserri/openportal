import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/ui/reveal";
import type { CostRankingView } from "@/features/landing/types";

import { CostRanking } from "./cost-ranking";

/**
 * apps/web/features/landing/components/cost-ranking-section.tsx
 *
 * Phase 3.3. Section wrapper for the "what does each model cost" chart.
 * Renders nothing when there are no models (view is null).
 */
export async function CostRankingSection({
  locale,
  view,
}: {
  locale: string;
  view: CostRankingView | null;
}) {
  if (!view) return null;
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section id="costs" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <h2 className="t-h2 text-foreground">{t("costRank.heading")}</h2>
        <p className="t-small mb-6 mt-1">{t("costRank.subheading")}</p>
      </Reveal>
      <Reveal direction="up" delay={0.1}>
        <CostRanking view={view} />
      </Reveal>
    </section>
  );
}
