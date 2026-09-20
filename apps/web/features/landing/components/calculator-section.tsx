import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/ui/reveal";
import type { CalculatorView } from "@/features/landing/types";

import { PayPerUseCalculator } from "./pay-per-use-calculator";

/**
 * apps/web/features/landing/components/calculator-section.tsx
 *
 * Phase 3.3. Hidden entirely when `calculator` is null (no usable
 * package to derive a YER rate from — see lib/pricing.ts
 * conservativeYerPerCredit and types.ts's LandingData.calculator doc).
 * This is a section-level decision made once here, not inside
 * PayPerUseCalculator, so that component can assume a non-null view.
 */
export async function CalculatorSection({
  locale,
  calculator,
}: {
  locale: string;
  calculator: CalculatorView | null;
}) {
  if (!calculator) return null;
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <h2 className="t-h2 text-center text-foreground">
          {t("calculator.heading", { budget: calculator.budgetLabel })}
        </h2>
        <p className="t-small mb-6 mt-2 text-center">{t("calculator.subheading")}</p>
      </Reveal>
      <Reveal direction="up" delay={0.1}>
        <PayPerUseCalculator view={calculator} />
      </Reveal>
      <Reveal direction="up" delay={0.15}>
        <p className="t-caption mt-4 text-center">{t("calculator.estimateDisclaimer")}</p>
      </Reveal>
    </section>
  );
}
