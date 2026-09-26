import { ConstellationBackground } from "./components/constellation-background";
import { LandingHeader } from "./components/landing-header";
import { LandingHero } from "./components/landing-hero";
import { GatewayDiagram } from "./components/gateway-diagram";
import { DemoSectionWrapper } from "./components/demo-section-wrapper";
import { PaymentMarquee } from "./components/payment-marquee";
import { PackagesSection } from "./components/packages-section";
import { StatsStrip } from "./components/stats-strip";
import { ModelsSection } from "./components/models-section";
import { CostRankingSection } from "./components/cost-ranking-section";
import { LiveBenchSection } from "./components/livebench-section";
import { ComparisonSection } from "./components/comparison-section";
import { LandingFooter } from "./components/landing-footer";
import { ScrollProgress } from "@/components/magicui/scroll-progress";
import { ConsentBanner } from "@/features/consent";
import { getLandingData } from "./lib/landing-data";

/**
 * apps/web/features/landing/index.tsx
 *
 * Composition root for the public landing page (Rule L4: the route file
 * only imports this).
 *
 * SINGLE FETCH, NOT PER-SECTION: everything the page needs — models,
 * packages, payment methods, modelCount, calculator, costRanking —
 * comes from one call to getLandingData() and is handed down as plain
 * props. Every section below is a Server Component receiving
 * already-finished data. Only the small interactive slices (the hero
 * calculator, the models grid's search/filter, the cost-ranking budget
 * picker, the LiveBench load-on-click button, the demo's typing effect)
 * are Client Components, and none of them fetch anything themselves.
 *
 * GRACEFUL DEGRADATION: getLandingData never throws — a broken public
 * query degrades that dataset to empty and the corresponding section
 * renders its own empty state (or hides, in the calculator's case).
 *
 * SECTION ORDER:
 *   hero → demo → gateway → payments → packages → stats →
 *   models → costs → livebench → comparison
 *
 *   The demo sits SECOND (right after the hero) because a real chat
 *   preview is the single strongest piece of proof on the page — it
 *   answers "what is this?" better than any paragraph. The gateway
 *   diagram then answers "how does it work?" before any prices appear.
 *   Numbers (packages/stats/models/costs) come after the visitor is
 *   already convinced the product is real.
 *
 * CONSTELLATION BACKGROUND: mounted ONCE here, at the page root, not
 * inside the hero. It renders `position: fixed` behind everything, so a
 * single instance covers the full page regardless of scroll length.
 *
 * SCROLL PROGRESS: a thin gradient bar pinned to the top of the viewport,
 * a direct readout of scroll position — deliberately not gated by
 * reduced-motion (it is data, not decoration).
 *
 * CALCULATOR SECTION: intentionally omitted. The interactive calculator
 * now lives inside <LandingHero> (right column) so the strongest proof
 * is in the first fold, not the eleventh. If you ever want the
 * deep-dive version back as a standalone section, uncomment the import
 * and the JSX line below.
 */
export async function LandingPage({ locale }: { locale: string }) {
  const data = await getLandingData(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <ConstellationBackground />
      <LandingHeader locale={locale} />

      <main className="flex-1">
        <LandingHero locale={locale} calculator={data.calculator} />
        <DemoSectionWrapper locale={locale} />
        <GatewayDiagram locale={locale} />
        <PaymentMarquee locale={locale} methods={data.paymentMethods} />
        <PackagesSection locale={locale} packages={data.packages} />
        <StatsStrip
          locale={locale}
          modelCount={data.modelCount}
          totalUsers={data.totalUsers}
        />
        <ModelsSection locale={locale} models={data.models} />
        <CostRankingSection locale={locale} view={data.costRanking} />
        <LiveBenchSection />
        {/* <CalculatorSection locale={locale} calculator={data.calculator} /> */}
        <ComparisonSection locale={locale} />
      </main>

      <LandingFooter locale={locale} />
      <ConsentBanner locale={locale} />
    </div>
  );
}