"use client";

import { Fragment, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { AuditDiffView } from "./audit-diff-view";
import type { AuditLogItem } from "../types";

interface AuditTableProps {
  items: AuditLogItem[];
  isLoading: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
}

/**
 * apps/web/features/admin/audit/components/audit-table.tsx (Phase 8c)
 *
 * "Load more" append, same keyset-cursor shape as `logs-table.tsx`. Each
 * row expands in place (no separate dialog/route) to reveal
 * `AuditDiffView` — an admin scanning a stream of actions wants to peek
 * at one row's before/after and keep scrolling, not lose their place in
 * a modal.
 */
export function AuditTable({ items, isLoading, hasMore, isFetchingMore, onLoadMore }: AuditTableProps) {
  const t = useTranslations("admin.auditPage.table");
  const locale = useLocale() as "ar" | "en";
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
              <TableHead>{t("admin")}</TableHead>
              <TableHead>{t("action")}</TableHead>
              <TableHead>{t("target")}</TableHead>
              <TableHead className="text-end">{t("details")}</TableHead>
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
              items.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <TableRow>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(row.createdAt, locale)}</TableCell>
                      <TableCell className="font-mono text-xs" title={row.adminId}>
                        {row.adminId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.action}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.targetType ? `${row.targetType}${row.targetId ? `:${row.targetId.slice(0, 8)}` : ""}` : "—"}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          onClick={() => setExpandedId(expanded ? null : row.id)}
                        >
                          {expanded ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
                          {expanded ? t("hide") : t("view")}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-secondary/40 p-3">
                          <AuditDiffView before={row.before} after={row.after} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
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
