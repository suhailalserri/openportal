"use client";

import { useMemo, useState } from "react";

import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 20;

export interface UsageLogFilters {
  /** yyyy-mm-dd (date-input value) or undefined = no lower bound (server clamps to 90d anyway). */
  from?: string | undefined;
  /** yyyy-mm-dd (date-input value) or undefined = now. */
  to?: string | undefined;
  modelId?: string | undefined;
}

const EMPTY_FILTERS: UsageLogFilters = {};

/**
 * apps/web/features/usage/hooks/use-usage-log.ts (Phase 6.2)
 *
 * Wraps `billing.listUsage` (B2, protectedProcedure, keyset/cursor
 * pagination — see apps/api/src/services/usage.service.ts's own comment
 * on why this isn't offset-based) with `useInfiniteQuery`. tRPC's
 * react-query integration supports this directly because the procedure's
 * input already has an optional `cursor: string` field and the output
 * has `nextCursor` — no client-side re-implementation of the pagination
 * logic, which is exactly what Phase Summary point 4 flagged as the risk
 * to avoid (skipped/duplicated rows from a hand-rolled offset scheme).
 *
 * `from`/`to` are plain `<input type="date">` strings (yyyy-mm-dd) here;
 * `z.coerce.date()` on the server parses that directly, so no client-side
 * Date math happens (Rule 1's "money is never computed client-side"
 * extends in spirit to "date range clamping is never computed
 * client-side" — the server's `clampRange()` is the only place that
 * decides what's in/out of the 90-day window).
 */
export function useUsageLog(filters: UsageLogFilters = EMPTY_FILTERS) {
  const input = useMemo(
    () => ({
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined,
      modelId: filters.modelId,
      limit: PAGE_SIZE,
    }),
    [filters.from, filters.to, filters.modelId]
  );

  const query = trpc.billing.listUsage.useInfiniteQuery(input, {
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    isEmpty: !query.isLoading && !query.isError && items.length === 0,
    hasMore: Boolean(query.hasNextPage),
    isFetchingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
}

/** Local UI state for the filter bar — kept out of the data hook so the two can be tested/reasoned about separately. */
export function useUsageLogFilterState() {
  const [filters, setFilters] = useState<UsageLogFilters>(EMPTY_FILTERS);
  return { filters, setFilters };
}
