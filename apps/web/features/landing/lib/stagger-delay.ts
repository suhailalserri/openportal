/**
 * apps/web/features/landing/lib/stagger-delay.ts
 *
 * Phase 3.3. Delay (seconds) for the index-th item of a staggered list.
 *
 * WHY THIS IS NOT IN components/ui/reveal.tsx: that file is a
 * "use client" module, and every export of a client module is a client
 * reference when imported from a Server Component. Calling one from a
 * Server Component throws "Attempted to call staggerDelay() from the
 * server but staggerDelay is on the client" (a production 500 on the
 * landing page). Pure helpers used by Server Components live in plain
 * modules like this one.
 */
export function staggerDelay(index: number, step = 0.08, max = 0.4): number {
  return Math.min(index * step, max);
}
