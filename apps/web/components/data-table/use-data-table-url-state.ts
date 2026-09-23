"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { buildDataTableSearchParams, parseDataTableParams, toggleSort, type DataTableUrlDefaults } from "./data-table-url-state";
import type { SortDirection } from "./types";

/**
 * apps/web/components/data-table/use-data-table-url-state.ts (Phase 8a)
 *
 * Thin client wrapper: all actual logic lives in
 * `data-table-url-state.ts`'s pure functions (unit-tested there — this
 * file cannot be, per this sandbox's own vitest.config.ts header on why
 * `useSearchParams`/`useRouter` need a real Next.js router context).
 *
 * `router.replace(..., { scroll: false })`: a page/sort/search change is
 * a refinement of the same view, not a navigation — scrolling back to
 * the top on every keystroke in the search box would be a bad TA-B
 * experience. `replace` (not `push`) so paging through results doesn't
 * fill the back-button history with one entry per page.
 */
export function useDataTableUrlState(defaults: DataTableUrlDefaults, prefix = "") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => parseDataTableParams(searchParams, defaults, prefix), [searchParams, defaults, prefix]);

  const push = useCallback(
    (patch: Parameters<typeof buildDataTableSearchParams>[1]) => {
      const next = buildDataTableSearchParams(searchParams, patch, defaults, prefix);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, defaults, prefix],
  );

  return {
    ...state,
    setPage: (page: number) => push({ page }),
    setPageSize: (pageSize: number) => push({ pageSize }),
    setSearch: (search: string) => push({ search }),
    setSort: (columnId: string) => {
      const { sortBy, sortDir } = toggleSort({ sortBy: state.sortBy, sortDir: state.sortDir as SortDirection }, columnId);
      push({ sortBy, sortDir });
    },
  };
}
