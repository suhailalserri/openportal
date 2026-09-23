"use client";

import { useLocale, useTranslations } from "next-intl";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoHint } from "@/components/shared/info-hint";
import { formatCredits } from "@/lib/format";
import type { UsageSummary } from "../types";

interface SummaryCardsProps {
  summary: UsageSummary | undefined;
  isLoading: boolean;
}

const toLocaleInt = (n: number, locale: "ar" | "en") =>
  n.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { numberingSystem: "latn" });

/**
 * apps/web/features/dashboard/components/summary-cards.tsx (Phase 6.1 polish)
 *
 * Three changes from the original 6.1 cut, all from explicit feedback:
 *
 *  1. "Top model" moved OUT of this grid entirely — it's now its own
 *     highlighted banner above these cards (top-model-card.tsx,
 *     rendered first in dashboard/index.tsx). The grid below is 4 cards,
 *     not 5.
 *  2. Tokens moved to the LAST slot and rebuilt as two stacked rows
 *     (input / output) at a smaller size, instead of one interpolated
 *     i18n string ("{input} إدخال / {output} إخراج") that was truncating
 *     on narrow screens.
 *  3. Every card title now has an `InfoHint` explaining the metric AND
 *     its unit — spent/avgCost are the internal credit ledger unit, NOT
 *     Yemeni rial (the actual payment currency per F8); requests/tokens
 *     are plain counts. This is exactly the "some are YER and others are
 *     Credit" confusion raised in feedback — credits are in fact the
 *     ONLY unit shown anywhere on this page (payments are YER, but
 *     usage/spend is always credits), the hints say so explicitly rather
 *     than leaving it implicit.
 *
 * Every credit figure still goes through `formatCredits` (Rule 1) —
 * nothing here does its own `/ 1_000_000`. Token counts and request
 * counts are plain integers from the server and render as-is.
 */
export function SummaryCards({ summary, isLoading }: SummaryCardsProps) {
  const locale = useLocale() as "ar" | "en";
  const t = useTranslations("dashboard.cards");

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card className="gap-2 p-4">
        <CardHeader className="gap-0 p-0">
          <div className="flex items-center gap-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("spent")}</CardTitle>
            <InfoHint label={t("hintLabel", { label: t("spent") })} content={t("spentHint")} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <p className="truncate text-lg font-semibold text-foreground">
              {summary ? formatCredits(summary.totalSpentMicroCredits, locale) : t("none")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="gap-2 p-4">
        <CardHeader className="gap-0 p-0">
          <div className="flex items-center gap-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("requests")}</CardTitle>
            <InfoHint label={t("hintLabel", { label: t("requests") })} content={t("requestsHint")} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <p className="truncate text-lg font-semibold text-foreground">
              {summary ? toLocaleInt(summary.requestCount, locale) : t("none")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="gap-2 p-4">
        <CardHeader className="gap-0 p-0">
          <div className="flex items-center gap-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("avgCost")}</CardTitle>
            <InfoHint label={t("hintLabel", { label: t("avgCost") })} content={t("avgCostHint")} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <p className="truncate text-lg font-semibold text-foreground">
              {summary ? formatCredits(summary.avgCostMicroCredits, locale) : t("none")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="gap-2 p-4">
        <CardHeader className="gap-0 p-0">
          <div className="flex items-center gap-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t("tokens")}</CardTitle>
            <InfoHint label={t("hintLabel", { label: t("tokens") })} content={t("tokensHint")} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : summary ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{t("tokensIn")}</span>
                <span className="truncate text-sm font-semibold text-foreground">
                  {toLocaleInt(summary.inputTokens, locale)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{t("tokensOut")}</span>
                <span className="truncate text-sm font-semibold text-foreground">
                  {toLocaleInt(summary.outputTokens, locale)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-lg font-semibold text-muted-foreground">{t("none")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
