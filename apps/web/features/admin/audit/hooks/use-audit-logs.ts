"use client";

import { useMemo, useState } from "react";

import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditLogFilters {
  from?: string | undefined;
  to?: string | undefined;
  adminId?: string | undefined;
  action?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
}

const EMPTY_FILTERS: AuditLogFilters = {};

/**
 * apps/web/features/admin/audit/hooks/use-audit-logs.ts (Phase 8c)
 *
 * Same `useInfiniteQuery` + keyset-cursor shape as
 * `use-admin-logs.ts`/`use-usage-log.ts`, against `admin.listAuditLogs`
 * (B3) instead. `adminId`/`targetId` are only sent once they parse as a
 * UUID, same reasoning as `use-admin-logs.ts`'s `userId` guard — the
 * procedure's input is `z.string().uuid()` for both.
 */
export function useAuditLogs(filters: AuditLogFilters = EMPTY_FILTERS) {
  const validAdminId = filters.adminId && UUID_RE.test(filters.adminId.trim()) ? filters.adminId.trim() : undefined;
  const validTargetId = filters.targetId && UUID_RE.test(filters.targetId.trim()) ? filters.targetId.trim() : undefined;

  const input = useMemo(
    () => ({
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined,
      adminId: validAdminId,
      action: filters.action || undefined,
      targetType: filters.targetType || undefined,
      targetId: validTargetId,
      limit: PAGE_SIZE,
    }),
    [filters.from, filters.to, validAdminId, filters.action, filters.targetType, validTargetId]
  );

  const query = trpc.admin.listAuditLogs.useInfiniteQuery(input, {
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

export function useAuditLogFilterState() {
  const [filters, setFilters] = useState<AuditLogFilters>(EMPTY_FILTERS);
  return { filters, setFilters };
}
