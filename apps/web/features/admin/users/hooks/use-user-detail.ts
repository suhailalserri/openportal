"use client";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/users/hooks/use-user-detail.ts (Phase 8b)
 *
 * Wraps `admin.getUserDetail` (user + balance + last 20 transactions).
 * Read-only; the mutations that act on this user (`use-update-user-
 * status.ts`, `use-adjust-credits.ts`) are separate hooks so the detail
 * page can invalidate/refetch this query after either without the query
 * itself knowing about them (same separation as billing's `use-redeem`
 * invalidating `billing.getBalance`).
 */
export function useUserDetail(userId: string) {
  const query = trpc.admin.getUserDetail.useQuery({ userId });

  return {
    user: query.data?.user,
    balance: query.data?.balance,
    recentTxns: query.data?.recentTxns ?? [],
    referredBy: query.data?.referredBy ?? null,
    referrals: query.data?.referrals ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
