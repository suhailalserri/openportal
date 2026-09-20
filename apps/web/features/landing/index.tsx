import { LandingHeader } from "./components/landing-header";
import { LandingHero } from "./components/landing-hero";
import { ModelGrid } from "./components/model-grid";
import { PackageGrid } from "./components/package-grid";
import { LandingFooter } from "./components/landing-footer";
import { ConsentBanner } from "@/features/consent";

/**
 * apps/web/features/landing/index.tsx
 *
 * Composition root for the public landing page (Rule L4: the route file
 * only imports this). Entirely Server Components — ModelGrid and
 * PackageGrid each independently await their own data (Promise.all
 * inside each, not here), so Next.js can stream them in as separate
 * suspense boundaries later if that becomes worth doing; not added now
 * since nothing in 3.2's "Done when" list asks for streaming/skeletons
 * here specifically.
 */
export function LandingPage({ locale }: { locale: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <LandingHeader locale={locale} />
      <main className="flex-1">
        <LandingHero locale={locale} />
        <ModelGrid locale={locale} />
        <PackageGrid locale={locale} />
      </main>
      <LandingFooter locale={locale} />
      <ConsentBanner locale={locale} />
    </div>
  );
}
