"use client";

import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/users/hooks/use-update-user-status.ts (Phase 8b)
 *
 * Wraps `admin.updateUserStatus` (suspend/reactivate). Invalidates both
 * `listUsers` (so the users table reflects the new status without a
 * manual refresh) and `getUserDetail` for this user (so the detail page
 * does too) — a suspend can be triggered from either screen's row/page
 * action.
 *
 * Self-suspend is blocked in the UI layer (the users feature checks the
 * signed-in admin's id against the row before rendering the action) —
 * see the phase summary's point 4: the server itself allows it, so this
 * is a UX guard, not the safety mechanism.
 */
export function useUpdateUserStatus() {
  const utils = trpc.useUtils();

  const mutation = trpc.admin.updateUserStatus.useMutation({
    onSuccess: async (_result, variables) => {
      await Promise.all([
        utils.admin.listUsers.invalidate(),
        utils.admin.getUserDetail.invalidate({ userId: variables.userId }),
      ]);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return {
    updateStatus: (userId: string, status: "active" | "suspended", reason?: string) =>
      mutation.mutateAsync({ userId, status, reason }),
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
