"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatCredits, formatDate } from "@/lib/format";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { useBatchCodes, useRevokeBatch, useRevokeCode } from "./hooks/use-batch-codes";

interface Props {
  batchId: string;
}

const STATUS_VARIANT: Record<string, "success" | "destructive" | "default"> = {
  unused: "default",
  used: "success",
  expired: "destructive",
  revoked: "destructive",
};

/**
 * apps/web/features/admin/codes/batch-detail.tsx (Phase 8b)
 *
 * The actual codes for one batch (`getBatchCodes`, `gcTime: 0` — see
 * that hook's comment). Three surfaces on the same data, all client-
 * side only, nothing round-trips a code through a URL:
 * - the on-screen table (codes are shown; this is an admin-only route
 *   already gated by the (admin) layout),
 * - a CSV export through `lib/csv.ts` (formula-injection guarded),
 * - a print view (`.print-codes` / `print:hidden` — the shell chrome
 *   hides itself via `components/layout/*`'s new `print:hidden`, this
 *   component's own screen-only controls hide via the same class, and
 *   `.print-codes` is the block that's ALWAYS visible, shown as a
 *   grid of cards only when printing via `hidden print:grid`).
 */
export function AdminCodeBatchDetail({ batchId }: Props) {
  const t = useTranslations("admin.codesPage");
  const locale = useLocale() as "ar" | "en";
  const { codes, isLoading, isError, refetch } = useBatchCodes(batchId);
  const revokeBatch = useRevokeBatch();
  const revokeCode = useRevokeCode();

  const [revokeBatchOpen, setRevokeBatchOpen] = useState(false);
  const [revokingCode, setRevokingCode] = useState<string | null>(null);

  function handleDownloadCsv() {
    const csv = buildCsv(
      [t("csv.code"), t("csv.status"), t("csv.creditAmount"), t("csv.usedBy"), t("csv.createdAt")],
      codes.map((c) => [c.code, c.status, formatCredits(c.creditAmount, locale), c.usedByUserId ?? "", formatDate(c.createdAt, locale)]),
    );
    downloadCsv(`codes-${batchId}.csv`, csv);
  }

  async function handleRevokeBatch() {
    await revokeBatch.revokeBatch(batchId);
    setRevokeBatchOpen(false);
  }

  async function handleRevokeCode() {
    if (!revokingCode) return;
    await revokeCode.revokeCode(revokingCode, batchId);
    setRevokingCode(null);
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <p>{t("loadError")}</p>
        <Button variant="outline" onClick={refetch}>{t("retry")}</Button>
      </div>
    );
  }

  const unusedCount = codes.filter((c) => c.status === "unused").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button variant="outline" onClick={handleDownloadCsv}>{t("downloadCsv")}</Button>
        <Button variant="outline" onClick={() => window.print()}>{t("printSheet")}</Button>
        {unusedCount > 0 && (
          <Button variant="destructive" onClick={() => setRevokeBatchOpen(true)}>{t("revokeBatch")}</Button>
        )}
      </div>

      <div className="print:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("csv.code")}</TableHead>
              <TableHead>{t("csv.status")}</TableHead>
              <TableHead>{t("csv.creditAmount")}</TableHead>
              <TableHead>{t("csv.createdAt")}</TableHead>
              <TableHead className="text-end">{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((code) => (
              <TableRow key={code.id}>
                <TableCell className="font-mono">{code.code}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[code.status] ?? "default"}>{t(`status.${code.status}` as "status.unused")}</Badge>
                </TableCell>
                <TableCell>{formatCredits(code.creditAmount, locale)}</TableCell>
                <TableCell>{formatDate(code.createdAt, locale)}</TableCell>
                <TableCell className="text-end">
                  {code.status === "unused" && (
                    <Button size="sm" variant="outline" onClick={() => setRevokingCode(code.code)}>
                      {t("revokeCode")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Print-only card grid — hidden on screen, the only thing visible
          when printing (the shell chrome and the table above both carry
          print:hidden). One card per code, redemption instructions kept
          short since these are meant to be cut apart / handed out. */}
      <div className="hidden print:grid print:grid-cols-2 print:gap-4">
        {codes.map((code) => (
          <div key={code.id} className="rounded-lg border border-border p-4 text-center">
            <p className="text-lg font-mono font-semibold">{code.code}</p>
            <p className="text-sm">{formatCredits(code.creditAmount, locale)} {t("credits")}</p>
            {code.faceValue && <p className="text-xs text-muted-foreground">{code.faceValue}</p>}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={revokeBatchOpen}
        onOpenChange={setRevokeBatchOpen}
        title={t("revokeBatchTitle")}
        description={t("revokeBatchDescription", { count: unusedCount })}
        confirmLabel={t("revokeBatch")}
        cancelLabel={t("cancel")}
        destructive
        isPending={revokeBatch.isPending}
        errorMessage={revokeBatch.error?.message}
        requireTypedConfirmation={{ targetText: "REVOKE", label: t("typeRevokeToConfirm") }}
        onConfirm={handleRevokeBatch}
      />

      <ConfirmDialog
        open={revokingCode !== null}
        onOpenChange={(open) => !open && setRevokingCode(null)}
        title={t("revokeCodeTitle")}
        confirmLabel={t("revokeCode")}
        cancelLabel={t("cancel")}
        destructive
        isPending={revokeCode.isPending}
        errorMessage={revokeCode.error?.message}
        onConfirm={handleRevokeCode}
      />
    </div>
  );
}
