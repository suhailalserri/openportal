/**
 * apps/web/features/dashboard/lib/period-range.ts (Phase 6.1)
 *
 * Turns a period selector (7/30/90 days) into the `{ from, to }` pair sent
 * to `billing.usageSummary` / `usageTimeseries` / `usageByModel`. Pure
 * function (no React, no `Date.now()` default parameter — `now` is always
 * passed in) so it's trivially unit-testable and doesn't silently drift
 * with the test runner's clock.
 *
 * Deliberately NOT used to re-bucket anything client-side (Rule 1 / phase
 * summary point 4): this only decides the request window. Every number
 * shown on the dashboard is exactly what `usage.service.ts` returns for
 * that window — no client-side day-bucketing, so there's no browser-TZ vs
 * server-UTC mismatch to get wrong.
 *
 * `to` is set to the *end* of "today" (23:59:59.999) rather than the
 * current instant, so a request made at 00:05 still includes all of
 * today's usage so far instead of an almost-empty last bucket — the
 * server's own `clampRange()` (usage.service.ts) is the real authority on
 * what's actually allowed (≤90 days), this just picks a sane default
 * request window.
 */

export const DASHBOARD_PERIODS = [7, 30, 90] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = 30;

export interface DashboardRange {
  from: Date;
  to: Date;
}

export function periodToRange(period: DashboardPeriod, now: Date): DashboardRange {
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const from = new Date(to);
  from.setDate(from.getDate() - (period - 1));
  from.setHours(0, 0, 0, 0);

  return { from, to };
}

export function isDashboardPeriod(value: number): value is DashboardPeriod {
  return (DASHBOARD_PERIODS as readonly number[]).includes(value);
}
