"use client";

import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

export interface GenerateCodesInput {
  count: number;
  creditValue: number;
  label: string;
  expiresAt?: string | undefined;
  packageId?: string | undefined;
  paymentMethodId?: string | undefined;
}

/**
 * apps/web/features/admin/codes/hooks/use-generate-codes.ts (Phase 8b)
 *
 * `generateCodes` returns the actual generated codes in its result
 * (`{ batchId, codes, count }`) — this hook hands that back to the
 * caller as-is so the generate dialog can offer an immediate CSV
 * download of the brand-new codes, same "keep codes out of storage"
 * posture as `getBatchCodes` (`lib/csv.ts`'s doc comment). Nothing here
 * persists the returned codes beyond the caller's own render.
 */
export function useGenerateCodes() {
  const utils = trpc.useUtils();

  const mutation = trpc.admin.generateCodes.useMutation({
    onSuccess: () => utils.admin.listCodeBatches.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  return {
    generate: (input: GenerateCodesInput) => mutation.mutateAsync(input),
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
