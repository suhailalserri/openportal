import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/ui/reveal";
import type { LandingModelRow } from "@/features/landing/types";

import { ModelsTable } from "./models-table";

/**
 * apps/web/features/landing/components/models-section.tsx
 *
 * Phase 3.3. Section wrapper around ModelsTable (replaces model-grid.tsx,
 * on the DELETE list). Heading key stays `modelsHeading` from 3.2 for
 * backward compatibility of the message key, even though the content
 * beneath it is now a table.
 */
export async function ModelsSection({ locale, models }: { locale: string; models: LandingModelRow[] }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  if (models.length === 0) {
    return (
      <section id="models" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="t-h2 mb-6 text-foreground">{t("modelsHeading")}</h2>
        <p className="t-small">{t("table.noResults")}</p>
      </section>
    );
  }

  return (
    <section id="models" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <h2 className="t-h2 text-foreground">{t("modelsHeading")}</h2>
        <p className="t-small mb-6 mt-1">{t("table.whatIsGoodFor")}</p>
      </Reveal>
      <Reveal direction="up" delay={0.1}>
        <ModelsTable rows={models} />
      </Reveal>
    </section>
  );
}
