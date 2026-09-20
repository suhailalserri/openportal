import { getTranslations } from "next-intl/server";

import { publicCaller } from "@/lib/trpc-server";
import { formatCredits, formatYer } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * apps/web/features/landing/components/package-grid.tsx
 *
 * Live package prices (YER — F8: Yemen market, Moyasar/SAR disabled),
 * fetched via publicCaller.billing.listPackages() — a real tRPC call
 * into billingRouter.listPackages, not a hand-copied query. That
 * procedure returns the full `packages` row (id, name, nameAr, priceYer,
 * priceUsdEquivalent, credits, description, descriptionAr, isActive,
 * sortOrder, createdAt, updatedAt) — this component only reads the
 * buyer-facing subset of those fields; priceUsdEquivalent is internal
 * margin data and is never rendered (see credit-packages.ts's own schema
 * comment: "never rendered to a buyer").
 *
 * formatCredits/formatYer are the only money-formatting functions
 * allowed (Rule 1) — this component never does its own arithmetic on
 * `credits` or `priceYer`.
 */
export async function PackageGrid({ locale }: { locale: string }) {
  const [packages, t] = await Promise.all([
    publicCaller.billing.listPackages(),
    getTranslations({ locale, namespace: "landing" }),
  ]);

  const localeTag: "ar" | "en" = locale === "ar" ? "ar" : "en";

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
      <h2 className="t-h2 mb-6 text-foreground">{t("packagesHeading")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {packages.map((pkg) => {
          const name = locale === "ar" ? pkg.nameAr : pkg.name;
          const description = locale === "ar" ? pkg.descriptionAr : pkg.description;
          return (
            <Card key={pkg.id}>
              <CardHeader>
                <CardTitle>{name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="t-h3 text-foreground">
                  {formatYer(pkg.priceYer, localeTag)} {t("yer")}
                </p>
                <p className="t-small">
                  {formatCredits(pkg.credits, localeTag)} {t("credits")}
                </p>
                {description ? <p className="t-caption">{description}</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
