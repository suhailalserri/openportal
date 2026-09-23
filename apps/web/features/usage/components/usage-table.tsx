"use client";

import { useLocale, useTranslations } from "next-intl";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCredits, formatDate } from "@/lib/format";
import { useModelCatalog } from "../hooks/use-model-catalog";
import type { UsageListItem } from "../types";

interface UsageTableProps {
  items: UsageListItem[];
  isLoading: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onSelectRow: (row: UsageListItem) => void;
}

/**
 * apps/web/features/usage/components/usage-table.tsx (Phase 6.2)
 *
 * "Load more" (append) rather than page-number navigation — matches the
 * server's keyset/cursor pagination shape (`nextCursor` is only ever
 * "the next page after what you already have", there is no "jump to
 * page N" the cursor design supports, see usage.service.ts's own
 * comment). `items` is already flattened across pages by the parent
 * hook (`useUsageLog`), so this component only renders and requests
 * more — no pagination math lives here.
 *
 * Built on the existing `components/ui/table.tsx` primitives directly
 * (no shared `DataTable` — that's Phase 8a, still open) per the plan's
 * own framing of this phase as frontend-only against what B2 already
 * shipped.
 */
export function UsageTable({ items, isLoading, hasMore, isFetchingMore, onLoadMore, onSelectRow }: UsageTableProps) {
  const t = useTranslations("usage.table");
  const locale = useLocale() as "ar" | "en";
  const { byId } = useModelCatalog();

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-[14px]" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("model")}</TableHead>
              <TableHead className="text-end">{t("tokens")}</TableHead>
              <TableHead className="text-end">{t("cost")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => {
              const model = row.modelId ? byId.get(row.modelId) : undefined;
              const modelLabel = row.modelId
                ? model
                  ? locale === "ar"
                    ? model.displayNameAr
                    : model.displayName
                  : row.modelId
                : t("unknownModel");
              const tokensIn = row.inputTokens ?? 0;
              const tokensOut = row.outputTokens ?? 0;

              return (
                <TableRow
                  key={row.id}
                  onClick={() => onSelectRow(row)}
                  className="cursor-pointer hover:bg-secondary/60"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectRow(row);
                    }
                  }}
                >
                  <TableCell className="text-sm text-muted-foreground">{formatDate(row.createdAt, locale)}</TableCell>
                  <TableCell className="text-foreground">{modelLabel}</TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {t("tokensValue", { input: tokensIn, output: tokensOut })}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-foreground">
                    {formatCredits(-row.amount, locale)}
                  </TableCell>
                </TableRow>
              );
            })}
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
