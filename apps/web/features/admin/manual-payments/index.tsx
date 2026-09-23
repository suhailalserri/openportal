"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDate, formatYer } from "@/lib/format";
import { useManualPayments, type ManualPaymentStatus } from "./hooks/use-manual-payments";

/**
 * apps/web/features/admin/manual-payments/index.tsx (Phase 8b)
 *
 * The claims queue. Status tabs are real server refetches; the search
 * box is explicitly labeled as filtering only the loaded page (phase
 * summary point 2 — `listManualPayments` has no server-side search or
 * total count to search against). Approve/reject both go through
 * `ConfirmDialog` — approve moves real money (a `creditBalance` call),
 * reject is a one-way status change with a required reason.
 */
export function AdminManualPayments() {
  const t = useTranslations("admin.manualPaymentsPage");
  const locale = useLocale() as "ar" | "en";
  const mp = useManualPayments();

  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function handleApprove() {
    if (!approveTarget) return;
    await mp.approve(approveTarget);
    setApproveTarget(null);
  }

  async function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    await mp.reject(rejectTarget, rejectReason.trim());
    setRejectTarget(null);
    setRejectReason("");
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={mp.status} onValueChange={(v) => mp.setStatus(v as ManualPaymentStatus)}>
        <TabsList>
          <TabsTrigger value="pending">{t("tabs.pending")}</TabsTrigger>
          <TabsTrigger value="approved">{t("tabs.approved")}</TabsTrigger>
          <TabsTrigger value="rejected">{t("tabs.rejected")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-1">
        <Input
          value={mp.filterText}
          onChange={(e) => mp.setFilterText(e.target.value)}
          placeholder={t("filterPlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("filterNote", { count: mp.totalLoaded })}</p>
      </div>

      {mp.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : mp.isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
          <p>{t("loadError")}</p>
          <Button variant="outline" onClick={mp.refetch}>{t("retry")}</Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.user")}</TableHead>
              <TableHead>{t("columns.package")}</TableHead>
              <TableHead>{t("columns.method")}</TableHead>
              <TableHead>{t("columns.reference")}</TableHead>
              <TableHead>{t("columns.submitted")}</TableHead>
              {mp.status === "pending" && <TableHead className="text-end">{t("columns.actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {mp.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">{t("empty")}</TableCell>
              </TableRow>
            ) : (
              mp.rows.map((row) => (
                <TableRow key={row.claim.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{row.userDisplayName || row.userEmail}</span>
                      <span className="text-xs text-muted-foreground">{row.userEmail}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{locale === "ar" ? row.packageNameAr : row.packageName}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.packagePriceYer != null ? `${formatYer(row.packagePriceYer, locale)} ${t("yer")}` : "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{locale === "ar" ? row.methodNameAr : row.methodName}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-mono text-xs">{row.claim.referenceCode}</span>
                      {row.claim.submittedTxRef && (
                        <span className="text-xs text-muted-foreground">{row.claim.submittedTxRef}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(row.claim.createdAt, locale)}</TableCell>
                  {mp.status === "pending" && (
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" onClick={() => setApproveTarget(row.claim.id)}>{t("approve")}</Button>
                        <Button size="sm" variant="destructive" onClick={() => setRejectTarget(row.claim.id)}>
                          {t("reject")}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={approveTarget !== null}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        title={t("approveTitle")}
        description={t("approveDescription")}
        confirmLabel={t("approve")}
        cancelLabel={t("cancel")}
        isPending={mp.isMutating}
        errorMessage={mp.mutationError?.message}
        onConfirm={handleApprove}
      />

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
        title={t("rejectTitle")}
        confirmLabel={t("reject")}
        cancelLabel={t("cancel")}
        destructive
        isPending={mp.isMutating}
        errorMessage={mp.mutationError?.message}
        onConfirm={handleReject}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="reject-reason">{t("rejectReasonLabel")}</Label>
          <Textarea id="reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
