"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCredits } from "@/lib/format";
import type { UsageSummary } from "../types";

type Summary = UsageSummary;

interface SummaryCardsProps {
  summary: Summary | undefined;
  isLoading: boolean;
}

/**
 * apps/web/features/dashboard/components/summary-cards.tsx (Phase 6.1)
 *
 * Every credit figure goes through `formatCredits` (the single
 * client-side money conversion point, Rule 1) — nothing here does its own
 * `/ 1_000_000`. Token counts and request counts are plain integers from
 * the server and render as-is.
 */
export function SummaryCards({ summary, isLoading }: SummaryCardsProps) {
  const locale = useLocale() as "ar" | "en";
  const t = useTranslations("dashboard.cards");

  const cards: Array<{ key: string; label: string; value: ReactNode }> = [
    {
      key: "spent",
      label: t("spent"),
      value: summary ? formatCredits(summary.totalSpentMicroCredits, locale) : null,
    },
    {
      key: "requests",
      label: t("requests"),
      value: summary ? summary.requestCount.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
        numberingSystem: "latn",
      }) : null,
    },
    {
      key: "tokens",
      label: t("tokens"),
      value: summary
        ? t("tokensValue", {
            input: summary.inputTokens.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
              numberingSystem: "latn",
            }),
            output: summary.outputTokens.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
              numberingSystem: "latn",
            }),
          })
        : null,
    },
    {
      key: "avgCost",
      label: t("avgCost"),
      value: summary ? formatCredits(summary.avgCostMicroCredits, locale) : null,
    },
    {
      key: "topModel",
      label: t("topModel"),
      value: summary?.topModelId ?? t("none"),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.key} className="gap-2 p-4">
          <CardHeader className="gap-0 p-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">{card.label}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <p className="truncate text-lg font-semibold text-foreground">{card.value}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
