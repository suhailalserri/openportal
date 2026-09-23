"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { SectionPage } from "@/components/layout/section-page";
import { useDashboardData } from "./hooks/use-dashboard-data";
import { PeriodSwitch } from "./components/period-switch";
import { TopModelCard } from "./components/top-model-card";
import { SummaryCards } from "./components/summary-cards";
import { SpendChart } from "./components/spend-chart";
import { ModelBreakdown } from "./components/model-breakdown";
import { DashboardEmptyState } from "./components/dashboard-empty-state";
import { DEFAULT_DASHBOARD_PERIOD, type DashboardPeriod } from "./lib/period-range";

/**
 * apps/web/features/dashboard/index.tsx (Phase 6.1, polish pass)
 *
 * `(app)/layout.tsx` already ran the server session guard (Rule 4) before
 * this ever renders, same pattern as `BillingView` — no client-side auth
 * check here, only data-fetch state (loading/error/empty).
 *
 * `TopModelCard` renders first, above `SummaryCards` — moved out of that
 * grid and given top billing per explicit feedback ("make it on the top
 * and highlight the model"). It reads the same `summary` object as
 * `SummaryCards`, just a different slice of it (`topModelId`).
 */
export function DashboardView() {
  const tNav = useTranslations("nav");
  const t = useTranslations("dashboard");
  const [period, setPeriod] = useState<DashboardPeriod>(DEFAULT_DASHBOARD_PERIOD);

  const { summary, timeseries, byModel, isLoading, isError, isEmpty } = useDashboardData(period);

  return (
    <SectionPage title={tNav("dashboard")} actions={<PeriodSwitch value={period} onChange={setPeriod} />}>
      {isError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t("error")}
        </p>
      ) : isEmpty ? (
        <DashboardEmptyState />
      ) : (
        <div className="flex flex-col gap-6">
          <TopModelCard summary={summary} isLoading={isLoading} />
          <SummaryCards summary={summary} isLoading={isLoading} />
          <SpendChart data={timeseries} isLoading={isLoading} />
          <ModelBreakdown data={byModel} isLoading={isLoading} />
        </div>
      )}
    </SectionPage>
  );
}
