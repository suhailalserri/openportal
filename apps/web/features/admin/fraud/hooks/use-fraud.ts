"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/fraud/hooks/use-fraud.ts (Phase 8c)
 *
 * `admin.listFraudEvents` takes `{ resolved, limit }` — same "server-side
 * boolean tab, no offset/count" shape as `admin.listManualPayments`'s
 * status tabs (8b), so this mirrors `use-manual-payments.ts`'s tab
 * pattern rather than the cursor-pagination one used for logs/audit.
 */
export function useFraud() {
  const t = useTranslations("admin.fraudPage");
  const [resolved, setResolved] = useState(false);
  const utils = trpc.useUtils();

  const query = trpc.admin.listFraudEvents.useQuery({ resolved, limit: 100 });

  const invalidate = () => utils.admin.listFraudEvents.invalidate();

  const resolveEvent = trpc.admin.resolveFraudEvent.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  const clearFlag = trpc.admin.clearFraudFlag.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t("flagCleared"));
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    resolved,
    setResolved,
    rows: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    resolveEvent: (eventId: string) => resolveEvent.mutateAsync({ eventId }),
    isResolving: resolveEvent.isPending,
    clearFlag: (userId: string) => clearFlag.mutateAsync({ userId }),
    isClearingFlag: clearFlag.isPending,
  };
}
