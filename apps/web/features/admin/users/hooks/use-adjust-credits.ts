"use client";

import { useRef } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/users/hooks/use-adjust-credits.ts (Phase 8b)
 *
 * Wraps `admin.adjustCredits`. Phase summary point 4: the procedure has
 * no idempotency key, takes whole credits only, and has no cap — so
 * this hook is where the client-side protection lives, on top of (not
 * instead of) `ConfirmDialog`'s own `isPending`-disables-both-buttons:
 *
 * - `requireTypedConfirmation` (wired by the caller) forces a deliberate
 *   pause before ANY adjustment fires.
 * - The `submitting` ref below is a synchronous lock, not React state.
 *   `isPending` from React Query is one render behind the actual mutate
 *   call — a fast double-click (or a stuck UI re-render) can fire twice
 *   before `isPending` flips true. The ref is set to `true` synchronously
 *   on the first call and checked before every subsequent one, so a
 *   second click in that window is dropped rather than sent.
 *
 * This is still a UX-layer guard, not a substitute for a real
 * idempotency key — flagged again in `BRANCH_AND_CI_NOTES.md`'s 8b entry
 * as a follow-up for whoever next touches `apps/api`'s admin router.
 */
export function useAdjustCredits() {
  const utils = trpc.useUtils();
  const submitting = useRef(false);

  const mutation = trpc.admin.adjustCredits.useMutation({
    onSuccess: async (_result, variables) => {
      await Promise.all([
        utils.admin.getUserDetail.invalidate({ userId: variables.userId }),
        utils.admin.listUsers.invalidate(),
      ]);
    },
    onError: (err) => {
      toast.error(err.message);
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  async function adjust(input: { userId: string; amount: number; type: "admin_credit" | "admin_debit"; reason: string }) {
    if (submitting.current) return;
    submitting.current = true;
    return mutation.mutateAsync(input);
  }

  return {
    adjust,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
