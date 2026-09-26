"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCredits, formatDate } from "@/lib/format";
import type { UsageTimeseriesPoint } from "../types";

interface SpendChartProps {
  data: UsageTimeseriesPoint[];
  isLoading: boolean;
}

/**
 * apps/web/features/dashboard/components/spend-chart.tsx (Phase 6.1)
 *
 * Renders exactly the `{ date, spentMicroCredits, requestCount }[]` the
 * server returns from `billing.usageTimeseries` — no client-side
 * re-bucketing by day (phase-summary point 4: a browser-TZ vs
 * server-UTC mismatch would otherwise silently shift a day's spend into
 * the wrong bar).
 *
 * RTL: recharts lays out left-to-right internally regardless of
 * document `dir` — it has no built-in RTL mode. We do NOT reverse the
 * `data` array for `ar`, because the dates must stay chronological
 * (oldest → newest) for the tooltip/axis to make sense either way;
 * flipping the array would make the axis run newest-to-oldest which
 * reads as backwards data, not just a mirrored container. `reversed`
 * on the X axis in `ar` instead mirrors the *rendering direction* only
 * (chart visually reads right-to-left, matching the page) while the
 * data order and tooltip content stay identical in both locales. Verify
 * this on the actual RTL preview per the phase's "Done when".
 *
 * Fix (verified against the RTL preview): the X axis must stay
 * `orientation="bottom"` in BOTH locales. `reversed` already flips which
 * end of the axis is "first" — flipping `orientation` to `"top"` on top
 * of that moves the axis line (and its tick labels) to the top edge of
 * the plot instead, throwing off the plot's vertical alignment against
 * the Y axis and the Area fill, which is what produced the broken /
 * overlapping layout in `ar`. Only the Y axis legitimately swaps sides
 * for RTL (`right` instead of `left`) — that's a left/right placement
 * choice, not an axis-direction one.
 */
export function SpendChart({ data, isLoading }: SpendChartProps) {
  const locale = useLocale() as "ar" | "en";
  const isRTL = locale === "ar";
  const t = useTranslations("dashboard.chart");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="h-64 p-0">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dashboard-spend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="date"
                reversed={isRTL}
                orientation="bottom"
                tickFormatter={(value: string) => formatDate(value, locale)}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                axisLine={{ stroke: "var(--color-border)" }}
                tickLine={false}
              />
              <YAxis
                orientation={isRTL ? "right" : "left"}
                tickFormatter={(value: number) => formatCredits(value, locale)}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                formatter={(value: number) => formatCredits(value, locale)}
                labelFormatter={(value: string) => formatDate(value, locale)}
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="spentMicroCredits"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                fill="url(#dashboard-spend-fill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
