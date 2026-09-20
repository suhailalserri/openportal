import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

export async function LandingHero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "landing" });

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
      <h1 className="t-h1 mx-auto max-w-3xl text-balance text-foreground">{t("heroTitle")}</h1>
      <p className="t-body mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
        {t("heroSubtitle")}
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Button size="lg" asChild>
          <Link href={`/${locale}/auth/register`}>{t("heroCta")}</Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href={`/${locale}/auth/login`}>{t("signIn")}</Link>
        </Button>
      </div>
    </section>
  );
}
