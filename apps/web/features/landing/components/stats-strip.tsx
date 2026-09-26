import { getTranslations } from "next-intl/server";

import { MagicCard } from "@/components/magicui/magic-card";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Reveal } from "@/components/ui/reveal";
import { staggerDelay } from "@/features/landing/lib/stagger-delay";

/**
 * apps/web/features/landing/components/stats-strip.tsx
 *
 * Phase 3.3+ (redesign). Same two numbers, wrapped in a single glowing
 * card with a subtle gold radial behind them, so the strip reads as a
 * quiet "at a glance" moment rather than a row of loose figures.
 *
 * "Models available" is real (LandingData.modelCount). "Total users" is
 * a PLACEHOLDER (config/placeholders.ts) and only renders when non-null;
 * landing-data.ts already resolves the gate server-side.
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
    {
      key: "modelCount",
      value: modelCount,
      label: t("stats.modelsAvailable"),
    },
    ...(totalUsers !== null
      ? [
          {
            key: "totalUsers",
            value: totalUsers,
            label: t("stats.totalUsers"),
          },
        ]
      : []),
  ];

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <div className="relative overflow-hidden rounded-[20px] border border-border bg-card">
          {/* Gold radial behind the numbers. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[80%] -translate-x-1/2 rounded-full bg-radial from-primary/15 to-transparent opacity-70 blur-3xl"
          />
          <div className="relative grid grid-cols-2 gap-8 px-8 py-10 md:gap-12 md:py-12">
            {stats.map((stat, i) => (
              <div key={stat.key} className="flex flex-col items-center text-center">
                <Reveal direction="up" delay={staggerDelay(i)}>
                  <AnimatedNumber
                    value={stat.value}
                    className="bg-gradient-to-b from-foreground to-primary bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-5xl"
                  />
                </Reveal>
                <p className="t-small mt-2">{stat.label}</p>
                {stat.key === "totalUsers" ? (
                  <p className="t-caption mt-1">{t("stats.totalUsersApprox")}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}