"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { DASHBOARD_PERIODS, type DashboardPeriod } from "../lib/period-range";

interface PeriodSwitchProps {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
}

/**
 * apps/web/features/dashboard/components/period-switch.tsx (Phase 6.1)
 *
 * Plain button group, not `Tabs` — there's no associated `TabsContent`
 * panel per value (all three panels below always render together, just
 * refetched for the new window), so a real ARIA tablist would be the
 * wrong semantics here. `aria-pressed` communicates the toggle state
 * instead.
 */
export function PeriodSwitch({ value, onChange }: PeriodSwitchProps) {
  const t = useTranslations("dashboard.period");

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
    >
      {DASHBOARD_PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          aria-pressed={value === period}
          onClick={() => onChange(period)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === period
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {t("days", { count: period })}
        </button>
      ))}
    </div>
  );
}
