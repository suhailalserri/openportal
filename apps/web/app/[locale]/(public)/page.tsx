/**
 * Moved here from app/[locale]/page.tsx in 2.1 (the route group keeps
 * the URL: still /ar and /en). Still a placeholder — the real landing
 * page (live models + prices) is Phase 3.2's job.
 *
 * Copy is intentionally unchanged from 1.2 and not yet translated; it is
 * replaced wholesale in 3.2, so no message keys are added for it here.
 */
export default function PublicHomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold text-foreground">OpenPortal</h1>
      <p className="text-sm text-muted-foreground">
        Foundation rebuild in progress — see /dev/kitchen-sink (dev only) for the component library.
      </p>
    </main>
  );
}
