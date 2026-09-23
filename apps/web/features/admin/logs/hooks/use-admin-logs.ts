"use client";

import { useMemo, useState } from "react";

import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 50;

export interface AdminLogFilters {
  /** yyyy-mm-dd (date-input value) or undefined = no lower bound (server clamps to 90d anyway). */
  from?: string | undefined;
  /** yyyy-mm-dd (date-input value) or undefined = now. */
  to?: string | undefined;
  userId?: string | undefined;
  modelId?: string | undefined;
}

const EMPTY_FILTERS: AdminLogFilters = {};

/**
 * apps/web/features/admin/logs/hooks/use-admin-logs.ts (Phase 8c)
 *
 * Wraps `admin.listUsageLogs` (B3) with `useInfiniteQuery`, the exact
 * same shape as `features/usage/hooks/use-usage-log.ts`'s
 * `billing.listUsage` wrapper — same keyset cursor convention
 * (`cursor`/`limit` in, `nextCursor` out), so no client-side pagination
 * math is reintroduced here either. The only difference from the
 * user-facing usage log is the extra `userId` filter, since this view is
 * admin-wide (no implicit `ctx.user.id` scoping — see
 * `admin-logs.service.ts`'s header comment).
 *
 * `userId` is passed through as free text and only sent to the server
 * when it parses as a UUID (the procedure's input is `z.string().uuid()`
 * — sending a partial/invalid value would just 400 on every keystroke).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useAdminLogs(filters: AdminLogFilters = EMPTY_FILTERS) {
  const validUserId = filters.userId && UUID_RE.test(filters.userId.trim()) ? filters.userId.trim() : undefined;

  const input = useMemo(
    () => ({
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined,
      userId: validUserId,
      modelId: filters.modelId || undefined,
      limit: PAGE_SIZE,
    }),
    [filters.from, filters.to, validUserId, filters.modelId]
  );

  const query = trpc.admin.listUsageLogs.useInfiniteQuery(input, {
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
    refetch: () => void query.refetch(),
  };
}

/** Local UI state for the filter bar — kept separate from the data hook, same split as `useUsageLogFilterState`. */
export function useAdminLogFilterState() {
  const [filters, setFilters] = useState<AdminLogFilters>(EMPTY_FILTERS);
  return { filters, setFilters };
}
