import { getTranslations } from "next-intl/server";

import { MagicCard } from "@/components/magicui/magic-card";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Reveal } from "@/components/ui/reveal";
import { staggerDelay } from "@/features/landing/lib/stagger-delay";

/**
 * apps/web/features/landing/components/stats-strip.tsx
 *
 * Phase 3.3. "Models available" is REAL (LandingData.modelCount, the
 * length of models.list — see lib/build-landing-data.ts). "Total users"
 * is a PLACEHOLDER (config/placeholders.ts PLACEHOLDER_TOTAL_USERS) and
 * is only rendered when `totalUsers` is non-null — landing-data.ts
 * already resolves that gate server-side (SHOW_TOTAL_USERS), so this
 * component just renders whatever it's handed and never re-decides
 * whether to show it.
 *
 * Both numbers animate via AnimatedNumber (count-up.ts), and the whole
 * strip enters via Reveal with a small stagger between the two stats.
 */

export async function StatsStrip({
  locale,
  modelCount,
  totalUsers,
}: {
  locale: string;
  modelCount: number;
  totalUsers: number | null;
}) {
  const t = await getTranslations({ locale, namespace: "landing" });

  const stats = [
    { key: "modelCount", value: modelCount, label: t("stats.modelsAvailable") },
    ...(totalUsers !== null
      ? [{ key: "totalUsers", value: totalUsers, label: t("stats.totalUsers") }]
      : []),
  ];

  return (
    <section className="border-y border-border bg-card/50">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-10 px-4 py-10 sm:px-6">
        {stats.map((stat, i) => (
          <Reveal key={stat.key} delay={staggerDelay(i)} direction="up">
            <MagicCard className="min-w-[200px] rounded-[16px]">
              <div className="px-8 py-6 text-center">
                <AnimatedNumber value={stat.value} className="t-h1 text-primary" />
                <p className="t-small mt-1">{stat.label}</p>
                {stat.key === "totalUsers" && (
                  <p className="t-caption mt-0.5">{t("stats.totalUsersApprox")}</p>
                )}
              </div>
            </MagicCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
