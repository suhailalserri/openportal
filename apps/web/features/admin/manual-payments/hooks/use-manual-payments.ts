"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

export type ManualPaymentStatus = "pending" | "approved" | "rejected";

/**
 * apps/web/features/admin/manual-payments/hooks/use-manual-payments.ts
 * (Phase 8b)
 *
 * Phase summary point 2: `listManualPayments` takes only `{ status,
 * limit }` — no offset, no status counts. So "status tabs" here means
 * refetching with a different `status` value (server-side, real), and
 * the search box filters ONLY the up-to-100 rows already loaded for the
 * current tab (client-side, NOT a full-dataset search) — the UI labels
 * this explicitly (see the feature component) rather than implying a
 * server-wide search that doesn't exist.
 */
export function useManualPayments() {
  const [status, setStatus] = useState<ManualPaymentStatus>("pending");
  const [filterText, setFilterText] = useState("");
  const utils = trpc.useUtils();

  const query = trpc.admin.listManualPayments.useQuery({ status, limit: 100 });

  const filtered = useMemo(() => {
    const rows = query.data ?? [];
    const term = filterText.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.userEmail, row.userDisplayName, row.claim.referenceCode, row.claim.senderPhone, row.claim.senderName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [query.data, filterText]);

  const invalidate = () => utils.admin.listManualPayments.invalidate();

  const approve = trpc.admin.approveManualPayment.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });
  const reject = trpc.admin.rejectManualPayment.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  return {
    status,
    setStatus,
    filterText,
    setFilterText,
    rows: filtered,
    totalLoaded: query.data?.length ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    approve: (claimId: string) => approve.mutateAsync({ claimId }),
    reject: (claimId: string, reason: string) => reject.mutateAsync({ claimId, reason }),
    isMutating: approve.isPending || reject.isPending,
    mutationError: approve.error ?? reject.error,
  };
}
