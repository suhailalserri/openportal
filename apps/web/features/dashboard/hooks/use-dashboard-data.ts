"use client";

import { useMemo } from "react";

import { trpc } from "@/lib/trpc";
import { periodToRange, type DashboardPeriod } from "../lib/period-range";

/**
 * apps/web/features/dashboard/hooks/use-dashboard-data.ts (Phase 6.1)
 *
 * Thin wrapper around the three B2 procedures (`billing.usageSummary`,
 * `usageTimeseries`, `usageByModel`), all called with the same `{ from,
 * to }` window so the summary cards, chart, and per-model breakdown can
 * never disagree about the period. Each is a separate protectedProcedure
 * query — tRPC's httpBatchLink (lib/trpc.ts) already coalesces these into
 * one HTTP request, so this isn't three round-trips.
 *
 * `from`/`to` are recomputed with `useMemo` keyed only on `period` (not on
 * `Date.now()`), so switching between 7/30/90 doesn't refetch on every
 * render — only when the selector actually changes.
 */
export function useDashboardData(period: DashboardPeriod) {
  const range = useMemo(() => periodToRange(period, new Date()), [period]);
  const input = { from: range.from, to: range.to };

  const summary = trpc.billing.usageSummary.useQuery(input);
  const timeseries = trpc.billing.usageTimeseries.useQuery(input);
  const byModel = trpc.billing.usageByModel.useQuery(input);

  const isLoading = summary.isLoading || timeseries.isLoading || byModel.isLoading;
  const isError = summary.isError || timeseries.isError || byModel.isError;

  // Empty-state check (Rule: don't compute money client-side — this only
  // checks presence/absence, never sums or converts anything).
  const isEmpty =
    !isLoading &&
    !isError &&
    (summary.data?.requestCount ?? 0) === 0;

  return {
    range,
    summary: summary.data,
    timeseries: timeseries.data ?? [],
    byModel: byModel.data ?? [],
    isLoading,
    isError,
    isEmpty,
  };
}
