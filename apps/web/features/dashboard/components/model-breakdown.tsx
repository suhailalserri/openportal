"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { InfoHint } from "@/components/shared/info-hint";
import { formatCredits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sortModelRows, nextModelSort, DEFAULT_MODEL_SORT, type ModelBreakdownSortKey, type SortDirection } from "../lib/sort-rows";
import { useModelCatalog } from "../hooks/use-model-catalog";
import type { UsageByModelRow } from "../types";

interface ModelBreakdownProps {
  data: UsageByModelRow[];
  isLoading: boolean;
}

const formatTokens = (n: number, locale: "ar" | "en") =>
  n.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { numberingSystem: "latn" });

interface SortHeaderProps {
  active: boolean;
  direction: SortDirection;
  align?: "start" | "end";
  onClick: () => void;
  children: ReactNode;
  ariaLabel: string;
}

/** One clickable, sortable `<th>` — active column shows the direction arrow, inactive columns show a neutral up/down glyph so it's discoverable before the first click. */
function SortHeader({ active, direction, align = "end", onClick, children, ariaLabel }: SortHeaderProps) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={align === "end" ? "text-end" : undefined}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center gap-1 text-[11.5px] font-medium text-faint-foreground transition-colors hover:text-foreground",
          align === "end" ? "justify-end" : "justify-start"
        )}
      >
        {children}
        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", active && "text-foreground")} />
      </button>
    </TableHead>
  );
}

/**
 * apps/web/features/dashboard/components/model-breakdown.tsx (Phase 6.1 polish)
 *
 * Two additions to the original 6.1 cut, both from explicit feedback:
 *
 *  1. Sortable headers — client-side only (`sortModelRows` /
 *     `nextModelSort` in ../lib/sort-rows, pure + unit-tested, same
 *     pattern as lib/period-range.ts). Default stays spend-descending,
 *     matching the original hardcoded `[...data].sort(...)` this
 *     replaces, so nothing shifts for anyone who never touches a header.
 *  2. The model column shows the catalog display name + badge
 *     (`useModelCatalog`, the same `models.list` join as
 *     top-model-card.tsx) instead of the raw id, with the same
 *     unpublished-model fallback to the raw id (rendered `dir="ltr"`,
 *     monospace — exactly the original cell's treatment).
 *
 * The card title also gets an `InfoHint` (feedback: "units to avoid
 * confusion") explaining all four columns' units in one place, rather
 * than one hint per column header — cheaper to maintain and the four
 * columns are read together as one row anyway.
 */
export function ModelBreakdown({ data, isLoading }: ModelBreakdownProps) {
  const locale = useLocale() as "ar" | "en";
  const t = useTranslations("dashboard.models");
  const { byId } = useModelCatalog();
  const [sort, setSort] = useState<{ key: ModelBreakdownSortKey; direction: SortDirection }>(
    DEFAULT_MODEL_SORT
  );

  const sorted = useMemo(
    () => sortModelRows(data, sort.key, sort.direction),
    [data, sort.key, sort.direction]
  );
  const handleSort = (key: ModelBreakdownSortKey) => setSort((prev) => nextModelSort(prev, key));

  return (
    <Card className="p-0">
      <CardHeader className="p-[18px] pb-0">
        <div className="flex items-center gap-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("title")}</CardTitle>
          <InfoHint label={t("hintLabel")} content={t("hint")} />
        </div>
      </CardHeader>
      <CardContent className="p-[18px]">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader
                    align="start"
                    active={sort.key === "model"}
                    direction={sort.direction}
                    onClick={() => handleSort("model")}
                    ariaLabel={t("sortBy", { column: t("model") })}
                  >
                    {t("model")}
                  </SortHeader>
                  <SortHeader
                    active={sort.key === "requests"}
                    direction={sort.direction}
                    onClick={() => handleSort("requests")}
                    ariaLabel={t("sortBy", { column: t("requests") })}
                  >
                    {t("requests")}
                  </SortHeader>
                  <SortHeader
                    active={sort.key === "tokens"}
                    direction={sort.direction}
                    onClick={() => handleSort("tokens")}
                    ariaLabel={t("sortBy", { column: t("tokens") })}
                  >
                    {t("tokens")}
                  </SortHeader>
                  <SortHeader
                    active={sort.key === "spent"}
                    direction={sort.direction}
                    onClick={() => handleSort("spent")}
                    ariaLabel={t("sortBy", { column: t("spent") })}
                  >
                    {t("spent")}
                  </SortHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row, index) => {
                  // `row.modelId` is `string | null` on UsageByModelRow (usage.service.ts,
                  // frozen — a transaction can carry a null modelId). `byId.get` requires a
                  // string key, so the lookup is guarded; a null id also has no raw id to
                  // fall back to, so it renders the same "—" as an empty/none value elsewhere
                  // on this page instead of the (never-true) empty string.
                  const catalogEntry = row.modelId ? byId.get(row.modelId) : undefined;
                  const displayName = catalogEntry
                    ? locale === "ar"
                      ? catalogEntry.displayNameAr
                      : catalogEntry.displayName
                    : (row.modelId ?? t("unknownModel"));

                  return (
                    <TableRow key={row.modelId ?? `unknown-${index}`}>
                      <TableCell className="max-w-40">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn("truncate text-xs", !catalogEntry && "font-mono")}
                            dir={catalogEntry ? undefined : "ltr"}
                          >
                            {displayName}
                          </span>
                          {catalogEntry?.badge ? (
                            <Badge variant="outline" className="shrink-0">
                              {catalogEntry.badge}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-end">{formatTokens(row.requestCount, locale)}</TableCell>
                      <TableCell className="text-end">
                        {t("tokensValue", {
                          input: formatTokens(row.inputTokens, locale),
                          output: formatTokens(row.outputTokens, locale),
                        })}
                      </TableCell>
                      <TableCell className="text-end font-medium">
                        {formatCredits(row.spentMicroCredits, locale)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
