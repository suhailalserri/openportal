"use client";

import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/codes/hooks/use-batch-codes.ts (Phase 8b)
 *
 * `gcTime: 0` (phase summary's "Code leak" note, batch 1's zip
 * transmittal message, and `lib/csv.ts`'s doc comment all point at the
 * same rule): codes are bearer credentials, so this query's result is
 * evicted from the React Query cache the instant nothing is subscribed
 * to it — leaving this page (closing the tab, navigating away) doesn't
 * leave a live batch of redeemable codes sitting in memory/devtools
 * indefinitely. `staleTime` is left at the default (0) since this is
 * always a fresh drill-down view, not something worth serving stale.
 */
export function useBatchCodes(batchId: string) {
  const query = trpc.admin.getBatchCodes.useQuery({ batchId }, { gcTime: 0 });
  return {
    codes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

export function useRevokeBatch() {
  const utils = trpc.useUtils();
  const mutation = trpc.admin.revokeCodeBatch.useMutation({
    onSuccess: async (_result, variables) => {
      await Promise.all([
        utils.admin.listCodeBatches.invalidate(),
        utils.admin.getBatchCodes.invalidate({ batchId: variables.batchId }),
      ]);
    },
    onError: (err) => toast.error(err.message),
  });
  return {
    revokeBatch: (batchId: string) => mutation.mutateAsync({ batchId }),
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

export function useRevokeCode() {
  const utils = trpc.useUtils();
  const mutation = trpc.admin.revokeCode.useMutation({
    onError: (err) => toast.error(err.message),
  });
  return {
    revokeCode: async (code: string, batchId: string) => {
      const result = await mutation.mutateAsync({ code });
      await utils.admin.getBatchCodes.invalidate({ batchId });
      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
