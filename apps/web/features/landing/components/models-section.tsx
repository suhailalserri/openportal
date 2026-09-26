import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/ui/reveal";
import type { LandingModelRow } from "@/features/landing/types";
import { ModelsGrid } from "./models-grid";

/**
 * apps/web/features/landing/components/models-section.tsx
 *
 * Phase 3.3+ (redesign). Same data contract; renders <ModelsGrid> now
 * (card grid) instead of <ModelsTable> (horizontal-scroll table). The
 * section's id="models" is load-bearing — e2e/landing.spec.ts scopes its
 * "GPT-4o" assertion to #models.
 */
export async function ModelsSection({
  locale,
  models,
}: {
  locale: string;
  models: LandingModelRow[];
}) {
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section
      id="models"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6"
    >
      <Reveal direction="up">
        <h2 className="t-h2 mb-6 text-foreground">{t("modelsHeading")}</h2>
      </Reveal>
      {models.length === 0 ? (
        <p className="t-small">{t("noModelsAvailable")}</p>
      ) : (
        <ModelsGrid rows={models} />
      )}
    </section>
  );
}