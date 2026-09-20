import { LandingPage } from "@/features/landing";

/**
 * apps/web/app/[locale]/(public)/page.tsx
 *
 * Phase 3.2 (docs/FRONTEND_REBUILD_PLAN.md). Replaces the placeholder
 * left by 2.1 ("the real landing page... is Phase 3.2's job" — see this
 * file's prior revision). Rule L4: thin route, all real content lives in
 * features/landing.
 *
 * `force-dynamic` is required, not optional: this page reads live data
 * via lib/trpc-server.ts's publicCaller (models.list, billing.listPackages),
 * with no cookies()/headers()/searchParams call anywhere in the render
 * path to otherwise signal Next.js that the route is request-dependent.
 * Without this, Next.js's default static-rendering heuristic would try
 * to prerender this page once at `next build` time — which (a) bakes a
 * stale model/price snapshot into the build, defeating the entire point
 * of Phase 3.2 replacing a hardcoded landing page with a live one, and
 * (b) would make `next build` itself fail in CI's `web-build` job, whose
 * `DATABASE_URL` is a deliberately-unreachable placeholder
 * ("postgres://placeholder:placeholder@localhost:1/unused" — see
 * .github/workflows/deploy.yml's web-build job env) since that job only
 * checks that the app compiles, not that it can reach a real database.
 */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function PublicHomePage({ params }: Props) {
  const { locale } = await params;
  return <LandingPage locale={locale} />;
}
