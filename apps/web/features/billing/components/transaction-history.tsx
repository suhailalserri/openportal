"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { formatCredits, formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getTransactionTypeMeta } from "../lib/transaction-labels";

const PAGE_SIZE = 20;

/**
 * apps/web/features/billing/components/transaction-history.tsx (Phase 5.2)
 *
 * `billing.getTransactions` (protectedProcedure, frozen) — offset-based
 * pagination per the existing procedure's own `{ limit, offset }` input
 * shape (not cursor-based; matching what's actually there rather than
 * introducing a different pagination style for one table). CSV export is
 * client-side, built from whatever page is currently loaded in React
 * Query's cache — there is no `billing.exportTransactions` endpoint, and
 * adding one is backend/out of scope for a frontend session; the export
 * button's tooltip/label reflects "this page" rather than implying a
 * full-history export.
 */
export function TransactionHistory() {
  const t = useTranslations("balance");
  const locale = useLocale() as "ar" | "en";
  const [offset, setOffset] = useState(0);

  const { data, isPending, isError } = trpc.billing.getTransactions.useQuery({ limit: PAGE_SIZE, offset });

  if (isPending) {
    return <Skeleton className="h-64 w-full rounded-[14px]" />;
  }

  if (isError || !data || data.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noHistory")}</p>;
  }

  function exportCsv() {
    if (!data) return;
    const header = ["date", "type", "amount_credits", "balance_after_credits", "description"];
    const rows = data.items.map((tx) => [
      tx.createdAt,
      tx.type,
      (tx.amount / 1_000_000).toString(),
      (tx.balanceAfter / 1_000_000).toString(),
      (tx.description ?? "").replace(/[\r\n,]/g, " "),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${offset}-${offset + data.items.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={exportCsv} className="gap-1.5">
          <Download className="size-4" aria-hidden="true" />
          {t("exportCsv")}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("history")}</TableHead>
              <TableHead>{t("typeColumn")}</TableHead>
              <TableHead className="text-end">{t("amountColumn")}</TableHead>
              <TableHead className="text-end">{t("balanceColumn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((tx) => {
              const meta = getTransactionTypeMeta(tx.type);
              const isCredit = tx.amount > 0;
              return (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(tx.createdAt, locale)}</TableCell>
                  <TableCell>
                    <Badge variant={meta.tone}>{t(`types.${meta.messageKey}`)}</Badge>
                  </TableCell>
                  <TableCell className={`text-end tabular-nums ${isCredit ? "text-success" : "text-foreground"}`}>
                    {isCredit ? "+" : ""}
                    {formatCredits(tx.amount, locale)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {formatCredits(tx.balanceAfter, locale)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
        >
          {t("prevPage")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!data.hasMore}
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
        >
          {t("nextPage")}
        </Button>
      </div>
    </div>
  );
}
