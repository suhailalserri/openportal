"use client";

import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import type { ManualPaymentSubmitInput } from "../types";

/**
 * apps/web/features/billing/hooks/use-manual-payment.ts (Phase 5.2)
 *
 * Wraps `billing.submitManualPayment` (protectedProcedure, frozen —
 * already has its own three-tier rate limiting server-side, see that
 * router's comments). This hook adds no client-side throttling beyond
 * disabling the submit button while `isPending` — same "UX nicety, not
 * the safety mechanism" framing as the approved phase summary: the
 * server's `checkLimit()` calls are the real guarantee against a
 * double-submit becoming two rows.
 *
 * On success, invalidates `billing.myManualPayments` so `MyClaimsList`
 * shows the new pending claim without a manual refresh, mirroring
 * `use-redeem.ts`'s `billing.getBalance` invalidation pattern from 5.1.
 */
export function useManualPayment() {
  const utils = trpc.useUtils();
  const [lastReferenceCode, setLastReferenceCode] = useState<string | null>(null);
  const mutation = trpc.billing.submitManualPayment.useMutation({
    onSuccess: async (result) => {
      if (result.referenceCode) setLastReferenceCode(result.referenceCode);
      await utils.billing.myManualPayments.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  async function submit(input: ManualPaymentSubmitInput) {
    setLastReferenceCode(null);
    return mutation.mutateAsync(input);
  }

  return {
    submit,
    isPending: mutation.isPending,
    lastReferenceCode,
    reset: () => {
      setLastReferenceCode(null);
      mutation.reset();
    },
  };
}
