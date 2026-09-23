import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/ui/reveal";
import type { LandingModelRow } from "@/features/landing/types";
import { ModelsTable } from "./models-table";

/**
 * apps/web/features/landing/components/models-section.tsx
 *
 * The "Available models" section of the landing page. `landing/index.tsx`
 * imports this file but it was missing from the repo, which failed
 * type-check, `next build` and the Playwright job's build step
 * (TS2307 / "Module not found").
 *
 * Server component: it only frames the already-finished, server-built
 * rows (`LandingModelRow[]`, see lib/build-landing-data.ts) and hands them
 * to the client-side ModelsTable, which does search/tier filtering only —
 * no price math (Rule 1). `id="models"` is load-bearing: e2e/landing.spec.ts
 * scopes its "GPT-4o" assertion to `#models`.
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
    <section id="models" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <h2 className="t-h2 mb-6 text-foreground">{t("modelsHeading")}</h2>
      </Reveal>
      {models.length === 0 ? (
        <p className="t-small">{t("noModelsAvailable")}</p>
      ) : (
        <ModelsTable rows={models} />
      )}
    </section>
  );
}
