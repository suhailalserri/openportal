import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { MagicCard } from "@/components/magicui/magic-card";
import { Reveal } from "@/components/ui/reveal";
import { staggerDelay } from "@/features/landing/lib/stagger-delay";
import type { LandingPackageView } from "@/features/landing/types";

/**
 * apps/web/features/landing/components/packages-section.tsx
 *
 * Phase 3.3+ (redesign). Same content, one addition: a "rate: X YER /
 * credit" line at the bottom of each card. The value arrives precomputed
 * from build-landing-data.ts (`rateLabel`) — no client-side division,
 * no parsing of formatted strings.
 */
export async function PackagesSection({
  locale,
  packages,
}: {
  locale: string;
  packages: LandingPackageView[];
}) {
  const t = await getTranslations({ locale, namespace: "landing" });

  if (packages.length === 0) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="t-h2 mb-6 text-foreground">{t("packagesHeading")}</h2>
        <p className="t-small">{t("noPackagesAvailable")}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <h2 className="t-h2 mb-6 text-foreground">{t("packagesHeading")}</h2>
      </Reveal>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {packages.map((pkg, i) => (
          <Reveal key={pkg.id} direction="up" delay={staggerDelay(i)}>
            <MagicCard className="h-full rounded-[14px]">
              <div className="flex h-full flex-col gap-3 p-[18px]">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] leading-none font-semibold text-foreground">
                    {pkg.name}
                  </h3>
                  {pkg.bestValue ? (
                    <Badge variant="default">{t("packages.bestValue")}</Badge>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <p className="t-h3 text-foreground">
                    {pkg.priceYer} {t("yer")}
                  </p>
                  <p className="t-small">
                    {pkg.credits} {t("credits")}
                  </p>
                  {pkg.description ? (
                    <p className="t-caption">{pkg.description}</p>
                  ) : null}
                </div>

                {/* Rate line — pushes to the card's bottom so every card's
                    rate sits on the same baseline regardless of description
                    length. */}
                <div className="mt-auto border-t border-border pt-3">
                  <p className="t-caption">
                    {t("packages.rateLabel")}:{" "}
                    <span className="font-mono font-medium text-foreground">
                      {pkg.rateLabel} {t("yer")}
                    </span>
                  </p>
                </div>
              </div>
            </MagicCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}