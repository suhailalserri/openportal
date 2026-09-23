"use client";

import { useMemo } from "react";

import { trpc } from "@/lib/trpc";
import { useDataTableUrlState } from "@/components/data-table/use-data-table-url-state";

const PAGE_SIZE = 20;

/**
 * apps/web/features/admin/users/hooks/use-users-list.ts (Phase 8b)
 *
 * Same URL-state + `admin.listUsers` wiring `features/admin/overview`'s
 * `use-recent-users.ts` proved out in 8a, with its own "users" prefix so
 * this page's page/search state doesn't collide with the overview's
 * preview table if both were ever visited via back/forward in the same
 * session (they're different routes, but the prefix is what namespaces
 * the URL params, not the route).
 *
 * `search` now actually filters server-side (8b fixed the previously
 * silently-ignored `admin.listUsers` search param — see
 * BRANCH_AND_CI_NOTES.md's 8b entry).
 */
export function useUsersList() {
  const url = useDataTableUrlState({ pageSize: PAGE_SIZE }, "users");

  const input = useMemo(
    () => ({
      limit: url.pageSize,
      offset: (url.page - 1) * url.pageSize,
      search: url.search || undefined,
    }),
    [url.pageSize, url.page, url.search],
  );

  const query = trpc.admin.listUsers.useQuery(input, { placeholderData: (prev) => prev });

  return {
    rows: query.data?.items ?? [],
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
    page: url.page,
    pageSize: url.pageSize,
    search: url.search,
    setPage: url.setPage,
    setSearch: url.setSearch,
  };
}
