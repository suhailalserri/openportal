import { GatewayDiagram } from "./components/gateway-diagram";
import { ConstellationBackground } from "./components/constellation-background";
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
import { ScrollProgress } from "@/components/magicui/scroll-progress";
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
 * effect, the demo's device toggle) are client components, and none of
 * them fetch anything themselves.
 *
 * GRACEFUL DEGRADATION: getLandingData never throws — each of its three
 * underlying reads is settled independently (Promise.allSettled) and a
 * failure degrades that dataset to empty, so one broken public query
 * cannot 500 the whole marketing page. Sections themselves render their
 * own empty states (ModelsSection, PackagesSection, CalculatorSection
 * hiding entirely when calculator is null).
 *
 * ORDER (revised this session): hero -> DEMO -> intro -> stats -> models
 * -> cost ranking -> LiveBench -> calculator -> packages -> payment
 * marquee -> comparison -> footer. The demo moved from LAST place
 * (where almost nobody scrolled to it) to SECOND place, right after the
 * hero. Rationale: a chat demo is self-explanatory evidence and is the
 * single strongest piece of proof on the page — it answers "what is
 * this?" better than any paragraph, and putting it before any numbers
 * means a visitor sees the product working before being asked to read
 * about it. Intro/stats stay right below the demo because they are
 * CONTEXT (who we are, how big we are), and context reads better after
 * evidence than before it. LiveBench keeps its position between the
 * models table and the cost chart — an external validation cue belongs
 * exactly there, next to the thing it validates.
 *
 * CONSTELLATION BACKGROUND: mounted ONCE here, at the page root, not
 * inside LandingHero — a follow-up round of this phase moved it from
 * hero-scoped to page-wide per feedback that it looked unfinished
 * stopping at the hero's bottom edge. It renders `position: fixed`
 * behind everything (`-z-10`, see the component), so one instance here
 * covers the full page regardless of scroll length; every section below
 * it in the DOM sits in normal flow above it with no z-index needed on
 * their part.
 *
 * SCROLL PROGRESS (added this session): a thin gradient bar pinned to
 * the top of the viewport, `fixed inset-x-0 top-0 z-50`, driven by
 * framer-motion's `useScroll` — a direct readout of scroll position, not
 * an animation, so it is deliberately NOT gated by `useReducedMotion()`.
 * Placed at the page root here rather than the layout so it only renders
 * on the landing page, and at `z-50` it sits above the constellation's
 * `-z-10` without any interaction — they never overlap in stacking order.
 */
export async function LandingPage({ locale }: { locale: string }) {
  const data = await getLandingData(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollProgress />
      <ConstellationBackground />
      <LandingHeader locale={locale} />
      <main className="flex-1">
        <LandingHero locale={locale} />
        <DemoSectionWrapper locale={locale} />
        <LandingIntro locale={locale} />
        <GatewayDiagram locale={locale} />  
        <PaymentMarquee locale={locale} methods={data.paymentMethods} />
        <PackagesSection locale={locale} packages={data.packages} />
        <StatsStrip locale={locale} modelCount={data.modelCount} totalUsers={data.totalUsers} />
        <ModelsSection locale={locale} models={data.models} />
        <CostRankingSection locale={locale} view={data.costRanking} />
        <LiveBenchSection />
        <CalculatorSection locale={locale} calculator={data.calculator} />
        <ComparisonSection locale={locale} />
      </main>
      <LandingFooter locale={locale} />
      <ConsentBanner locale={locale} />
    </div>
  );
}