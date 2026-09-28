"use client";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/users/hooks/use-referral-leaderboard.ts
 *
 * Wraps `admin.getReferralLeaderboard` — top referrers platform-wide,
 * shown above the users table so "who brings who" is visible without
 * opening each user's detail page. Read-only, same shape as
 * `use-user-detail.ts`'s referral fields (`referredCount`,
 * `bonusesAwarded`, `totalBonusMicroCredits`).
 */
export function useReferralLeaderboard(limit = 10) {
  const query = trpc.admin.getReferralLeaderboard.useQuery({ limit });

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
