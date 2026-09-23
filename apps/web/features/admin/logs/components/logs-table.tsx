"use client";

import { useLocale, useTranslations } from "next-intl";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCredits, formatDate } from "@/lib/format";
import type { UsageLogItem } from "../types";

interface LogsTableProps {
  items: UsageLogItem[];
  isLoading: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
}

/**
 * apps/web/features/admin/logs/components/logs-table.tsx (Phase 8c)
 *
 * "Load more" append, mirroring `usage-table.tsx` (6.2) exactly — same
 * keyset cursor shape server-side (`admin-logs.service.ts`'s
 * `listUsageLogs`), so there is no page-number control to build here.
 * Adds one column `usage-table.tsx` doesn't need: `userId` (truncated,
 * full value in `title`), since this view spans every user.
 */
export function LogsTable({ items, isLoading, hasMore, isFetchingMore, onLoadMore }: LogsTableProps) {
  const t = useTranslations("admin.logsPage.table");
  const locale = useLocale() as "ar" | "en";

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-[14px]" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-[14px] border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("user")}</TableHead>
              <TableHead>{t("model")}</TableHead>
              <TableHead className="text-end">{t("tokens")}</TableHead>
              <TableHead className="text-end">{t("cost")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(row.createdAt, locale)}</TableCell>
                  <TableCell className="font-mono text-xs" title={row.userId}>
                    {row.userId.slice(0, 8)}
                  </TableCell>
                  <TableCell>{row.modelId ?? t("unknownModel")}</TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {t("tokensValue", { input: row.inputTokens ?? 0, output: row.outputTokens ?? 0 })}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-foreground">
                    {formatCredits(-row.amount, locale)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" disabled={isFetchingMore} onClick={onLoadMore}>
            {isFetchingMore ? t("loadingMore") : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
