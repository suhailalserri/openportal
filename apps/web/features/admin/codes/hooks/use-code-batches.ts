"use client";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/codes/hooks/use-code-batches.ts (Phase 8b)
 *
 * `listCodeBatches` returns per-batch aggregates only (total/used/
 * expired) — no codes, no pagination. Small admin-curated list, plain
 * `useQuery` like packages/payment-methods.
 */
export function useCodeBatches() {
  const query = trpc.admin.listCodeBatches.useQuery();
  return {
    batches: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
