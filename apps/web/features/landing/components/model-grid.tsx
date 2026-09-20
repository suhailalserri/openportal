import { getTranslations } from "next-intl/server";

import { publicCaller } from "@/lib/trpc-server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * apps/web/features/landing/components/model-grid.tsx
 *
 * Live model catalog for the landing page. Rule 1 (money is never
 * computed client-side — extended here to "server-sourced"): pricing and
 * availability come from publicCaller.models.list() — a real tRPC call
 * into modelsRouter.list (apps/api/src/routers/models.router.ts) via the
 * server caller in lib/trpc-server.ts, not a hand-copied query — so a
 * change to that router (new field, different filter, renamed prop) is
 * reflected here automatically and a mismatch fails the type-check
 * rather than silently drifting.
 *
 * Reuses the existing (currently-unused) `models` message namespace from
 * 1.2/2.x rather than adding parallel keys under `landing`.
 */
export async function ModelGrid({ locale }: { locale: string }) {
  const [models, t, tLanding] = await Promise.all([
    publicCaller.models.list(),
    getTranslations({ locale, namespace: "models" }),
    getTranslations({ locale, namespace: "landing" }),
  ]);

  if (models.length === 0) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="t-h2 mb-6 text-foreground">{tLanding("modelsHeading")}</h2>
        <p className="t-small">{t("noneAvailable")}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h2 className="t-h2 mb-6 text-foreground">{tLanding("modelsHeading")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((model) => {
          const displayName = locale === "ar" ? model.displayNameAr : model.displayName;
          return (
            <Card key={model.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{displayName}</CardTitle>
                  {model.badge ? <Badge variant="info">{model.badge}</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge variant={model.tier === "premium" ? "default" : "secondary"}>
                  {model.tier === "premium" ? t("premium") : t("standard")}
                </Badge>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                  <dt>{t("contextWindow")}</dt>
                  <dd className="text-end text-foreground">
                    {model.contextWindow.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
                      numberingSystem: "latn",
                    })}
                  </dd>
                  <dt>{t("priceInput")}</dt>
                  <dd className="text-end text-foreground">
                    {model.creditsPerKInput} / {t("perThousand")}
                  </dd>
                  <dt>{t("priceOutput")}</dt>
                  <dd className="text-end text-foreground">
                    {model.creditsPerKOutput} / {t("perThousand")}
                  </dd>
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
