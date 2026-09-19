/**
 * Placeholder only. The previous version of this file redirected to
 * /chat, which this phase deletes (app/[locale]/chat/** is on the
 * DELETE list — chat comes back in Phase 4). Redirecting to a route
 * that no longer exists would 404 immediately, so this renders a plain
 * landing stub instead until Phase 2's route groups exist to redirect
 * into.
 */
export default function RootPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold text-foreground">OpenPortal</h1>
      <p className="text-sm text-muted-foreground">
        Foundation rebuild in progress — see /dev/kitchen-sink (dev only) for the component library.
      </p>
    </main>
  );
}
