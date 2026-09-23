"use client";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/channels/hooks/use-channels.ts (Phase 8c)
 *
 * Read-only (New API owns channel config — see admin.router.ts's own
 * comment on `gatewayChannels`). No mutation, no invalidation target;
 * `refetch` is the only user-facing action.
 */
export function useChannels() {
  const query = trpc.admin.gatewayChannels.useQuery();

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message,
    refetch: () => void query.refetch(),
  };
}
