"use client";

import { useMemo } from "react";

import { trpc } from "@/lib/trpc";
import { useDataTableUrlState } from "@/components/data-table/use-data-table-url-state";

const PAGE_SIZE = 10;

/**
 * apps/web/features/admin/overview/hooks/use-recent-users.ts (Phase 8a)
 *
 * Wraps `admin.listUsers` — offset/limit + `search`, `hasMore: rows.length
 * === limit` (apps/api/src/routers/admin.router.ts) — with
 * `useDataTableUrlState` so page/search survive a reload via the URL.
 *
 * NOT wired for sort: `listUsers` takes only `{ limit, offset, search }`,
 * no `sortBy`/`sortDir` — there is nothing server-side to sort BY yet.
 * `DataTable`'s `sort` prop is intentionally left unset by
 * `features/admin/overview/index.tsx` rather than faking a sort control
 * that would silently no-op; see `docs/frontend/BRANCH_AND_CI_NOTES.md`'s
 * 8a entry for the plan-vs-code note this comes from. 8b can add real
 * sorting once the procedure supports it.
 *
 * This is a READ-ONLY preview of `listUsers` (no row actions, no
 * `updateUserStatus`/`adjustCredits` wiring) — that's 8b's job once
 * `ConfirmDialog` has a real money/destructive action to gate. Its
 * purpose here is to prove the DataTable + URL-state combination end to
 * end against a real procedure before 8b builds the full users page on
 * top of it.
 */
export function useRecentUsers() {
  const url = useDataTableUrlState({ pageSize: PAGE_SIZE }, "users");

  const input = useMemo(
    () => ({
      limit: url.pageSize,
      offset: (url.page - 1) * url.pageSize,
      search: url.search || undefined,
    }),
    [url.pageSize, url.page, url.search],
  );

  const query = trpc.admin.listUsers.useQuery(input);

  return {
    rows: query.data?.items ?? [],
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    page: url.page,
    pageSize: url.pageSize,
    search: url.search,
    setPage: url.setPage,
    setSearch: url.setSearch,
  };
}
