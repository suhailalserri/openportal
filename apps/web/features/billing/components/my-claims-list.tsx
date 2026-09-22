"use client";

import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BadgeTone } from "../lib/transaction-labels";

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "info",
  approved: "success",
  rejected: "destructive",
};

/**
 * apps/web/features/billing/components/my-claims-list.tsx (Phase 5.2)
 *
 * `billing.myManualPayments` (protectedProcedure, frozen) — the buyer's
 * own manual-transfer claims, newest first. Approve/reject happens in
 * the admin UI (Phase 8b, not built yet); this is read-only status
 * tracking so a buyer isn't left wondering whether their transfer was
 * seen. `rejectionReason` (nullable on the row) is shown only when
 * present — most claims never get one.
 */
export function MyClaimsList() {
  const t = useTranslations("billing.claims");
  const locale = useLocale() as "ar" | "en";
  const { data, isPending } = trpc.billing.myManualPayments.useQuery({ limit: 20 });

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {data.map((claim) => (
        <div key={claim.id} className="flex flex-col gap-1 rounded-[10px] border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm">{claim.referenceCode}</span>
            <Badge variant={STATUS_TONE[claim.status] ?? "outline"}>{t(`status.${claim.status}`)}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{formatDate(claim.createdAt, locale)}</span>
          {claim.status === "rejected" && claim.rejectionReason ? (
            <p className="text-xs text-destructive">{claim.rejectionReason}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
