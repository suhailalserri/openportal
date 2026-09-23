"use client";

import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * apps/web/features/dashboard/components/dashboard-empty-state.tsx (Phase 6.1)
 *
 * Shown instead of the cards/chart/table when `usageSummary.requestCount`
 * is 0 for the selected period — e.g. a brand-new account, or an existing
 * account viewed on a 7-day window with no recent activity (switching to
 * 30/90 may surface data again, so the copy points at the period switch
 * rather than implying the account has never been used).
 */
export function DashboardEmptyState() {
  const t = useTranslations("dashboard.empty");

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <BarChart3 className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{t("title")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("description")}</p>
      </CardContent>
    </Card>
  );
}
