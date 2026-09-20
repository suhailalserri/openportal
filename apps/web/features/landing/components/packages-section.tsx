import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal, staggerDelay } from "@/components/ui/reveal";
import type { LandingPackageView } from "@/features/landing/types";

/**
 * apps/web/features/landing/components/packages-section.tsx
 *
 * Phase 3.3. Replaces components/package-grid.tsx (3.2, on the DELETE
 * list): same content, but reads from the single shared LandingData
 * fetch (lib/landing-data.ts) instead of independently calling
 * publicCaller.billing.listPackages() a second time — 3.2 had ModelGrid
 * and PackageGrid each fetching separately, and 3.3's new calculator
 * needs models AND packages together, so everything is fetched once and
 * handed down (see landing-data.ts's own doc).
 *
 * `bestValue` (computed server-side by build-landing-data.ts's
 * bestValuePackageIndex) drives a "Best value" badge — new in 3.3,
 * absent from the old grid.
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
            <Card className={pkg.bestValue ? "border-primary" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{pkg.name}</CardTitle>
                  {pkg.bestValue && <Badge variant="default">{t("packages.bestValue")}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="t-h3 text-foreground">
                  {pkg.priceYer} {t("yer")}
                </p>
                <p className="t-small">
                  {pkg.credits} {t("credits")}
                </p>
                {pkg.description ? <p className="t-caption">{pkg.description}</p> : null}
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
