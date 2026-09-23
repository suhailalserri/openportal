"use client";

import { useLocale, useTranslations } from "next-intl";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCredits } from "@/lib/format";
import type { UsageByModelRow } from "../types";

interface ModelBreakdownProps {
  data: UsageByModelRow[];
  isLoading: boolean;
}

const formatTokens = (n: number, locale: "ar" | "en") =>
  n.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { numberingSystem: "latn" });

/**
 * apps/web/features/dashboard/components/model-breakdown.tsx (Phase 6.1)
 *
 * Sorted by spend descending — the server doesn't guarantee an order for
 * `usageByModel`, so this is a display-only `[...data].sort(...)` on the
 * already-fetched rows (not a re-query), same spirit as the chart: no
 * money is recomputed, only re-ordered for presentation.
 */
export function ModelBreakdown({ data, isLoading }: ModelBreakdownProps) {
  const locale = useLocale() as "ar" | "en";
  const t = useTranslations("dashboard.models");

  const sorted = [...data].sort((a, b) => b.spentMicroCredits - a.spentMicroCredits);

  return (
    <Card className="p-0">
      <CardHeader className="p-[18px] pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{t("title")}</CardTitle>
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
                  <TableHead>{t("model")}</TableHead>
                  <TableHead className="text-end">{t("requests")}</TableHead>
                  <TableHead className="text-end">{t("tokens")}</TableHead>
                  <TableHead className="text-end">{t("spent")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow key={row.modelId}>
                    <TableCell className="max-w-40 truncate font-mono text-xs" dir="ltr">
                      {row.modelId}
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
