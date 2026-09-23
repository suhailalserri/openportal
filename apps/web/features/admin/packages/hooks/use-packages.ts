"use client";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/packages/hooks/use-packages.ts (Phase 8b)
 *
 * `admin.listPackages` has no pagination/search params (it's a small,
 * admin-curated list, not a growing log) — so unlike users/codes this
 * is a plain `useQuery`, no `useDataTableUrlState`.
 */
export function usePackages() {
  const query = trpc.admin.listPackages.useQuery();
  return {
    packages: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
