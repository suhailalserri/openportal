import { LandingHeader } from "./components/landing-header";
import { LandingHero } from "./components/landing-hero";
import { LandingIntro } from "./components/landing-intro";
import { StatsStrip } from "./components/stats-strip";
import { ModelsSection } from "./components/models-section";
import { CostRankingSection } from "./components/cost-ranking-section";
import { LiveBenchSection } from "./components/livebench-section";
import { CalculatorSection } from "./components/calculator-section";
import { PackagesSection } from "./components/packages-section";
import { PaymentMarquee } from "./components/payment-marquee";
import { ComparisonSection } from "./components/comparison-section";
import { DemoSectionWrapper } from "./components/demo-section-wrapper";
import { LandingFooter } from "./components/landing-footer";
import { ConsentBanner } from "@/features/consent";
import { getLandingData } from "./lib/landing-data";

/**
 * apps/web/features/landing/index.tsx
 *
 * Composition root for the public landing page (Rule L4: the route file
 * only imports this). Phase 3.3 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * SINGLE FETCH, NOT PER-SECTION: 3.2 had ModelGrid and PackageGrid each
 * independently calling their own tRPC procedure. 3.3's calculator needs
 * models AND packages together, and the stats strip needs the model
 * count that models.list already returns — so everything is fetched
 * ONCE here via getLandingData() and handed down as plain props, per
 * that function's own doc comment. Every section below is a Server
 * Component receiving already-finished data; only the small
 * interactive slices (search/filter, the calculator's model/size
 * picker, the LiveBench load-on-click button, the demo's typing
 * effect) are client components, and none of them fetch anything
 * themselves.
 *
 * GRACEFUL DEGRADATION: getLandingData never throws — each of its three
 * underlying reads is settled independently (Promise.allSettled) and a
 * failure degrades that dataset to empty, so one broken public query
 * cannot 500 the whole marketing page. Sections themselves render their
 * own empty states (ModelsSection, PackagesSection, CalculatorSection
 * hiding entirely when calculator is null).
 *
 * ORDER: hero -> intro -> stats -> models table -> LiveBench -> pay-per-use
 * calculator -> packages -> payment marquee -> comparison -> demo (hidden
 * until real/simulated content exists) -> footer. This follows the plan's
 * "also in the build" list order (docs/FRONTEND_REBUILD_PLAN.md Phase 3.3
 * summary) rather than an arbitrary arrangement.
 */
export async function LandingPage({ locale }: { locale: string }) {
  const data = await getLandingData(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <LandingHeader locale={locale} />
      <main className="flex-1">
        <LandingHero locale={locale} />
        <LandingIntro locale={locale} />
        <StatsStrip locale={locale} modelCount={data.modelCount} totalUsers={data.totalUsers} />
        <ModelsSection locale={locale} models={data.models} />
        <CostRankingSection locale={locale} view={data.costRanking} />
        <LiveBenchSection />
        <CalculatorSection locale={locale} calculator={data.calculator} />
        <PackagesSection locale={locale} packages={data.packages} />
        <PaymentMarquee locale={locale} methods={data.paymentMethods} />
        <ComparisonSection locale={locale} />
        <DemoSectionWrapper locale={locale} />
      </main>
      <LandingFooter locale={locale} />
      <ConsentBanner locale={locale} />
    </div>
  );
}
