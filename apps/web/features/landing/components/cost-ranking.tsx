"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { CostRankingView, MessageSizeId } from "@/features/landing/types";

/**
 * apps/web/features/landing/components/cost-ranking.tsx
 *
 * Phase 3.3+ (redesign). Adds a budget picker (chips) above the chart.
 * Bars themselves are unchanged — the picker only decides which rows get
 * a subtle "fits" tint and how many models fit at the chosen budget.
 *
 * The budget comparison is DISPLAY-ONLY: we compare the server's
 * already-formatted `priceLabel` against the chosen budget to decide a
 * yes/no tint. No price is recomputed, no division happens, nothing is
 * derived that isn't already on screen. This is the smallest honest
 * reading of Rule 1 for a purely visual affordance.
 */

const PROVIDER_COLORS = [
  "#7C3AED",
  "#EF4444",
  "#0F172A",
  "#3B5FB5",
  "#F59E0B",
  "#EC4899",
  "#10A37F",
  "#CC785C",
] as const;

const COLLAPSED_COUNT = 12;

const BUDGET_OPTIONS = [500, 1000, 2500, 5000, 10000] as const;
const DEFAULT_BUDGET = 1000;

function colorFor(index: number): string {
  return (
    PROVIDER_COLORS[
      ((index % PROVIDER_COLORS.length) + PROVIDER_COLORS.length) %
        PROVIDER_COLORS.length
    ] ?? "#888"
  );
}

/**
 * Parses a formatted YER price string back to a number, purely for the
 * "does this row fit the user's budget" comparison. Never used to
 * compute a price, only to compare two already-known values. Free models
 * ("0") and sub-cent "‹0.01" get sensible defaults so they never trip the
 * tint either way.
 */
function priceLabelToNumber(label: string): number {
  if (!label || label === "0") return 0;
  if (label === "<0.01") return 0.005;
  const cleaned = label.replace(/,/g, "").replace(/[^\d.]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function CostRanking({ view }: { view: CostRankingView }) {
  const t = useTranslations("landing");
  const reduce = useReducedMotion();
  const [sizeId, setSizeId] = React.useState<MessageSizeId>(
    view.sizes.find((s) => s.id === "medium")?.id ?? view.sizes[0]?.id ?? "short",
  );
  const [expanded, setExpanded] = React.useState(false);
  const [budget, setBudget] = React.useState<number>(DEFAULT_BUDGET);

  const all = view.rows[sizeId] ?? [];
  const rows = expanded ? all : all.slice(0, COLLAPSED_COUNT);

  const affordableCount = React.useMemo(
    () =>
      all.filter((r) => {
        if (r.isFree) return true;
        return priceLabelToNumber(r.priceLabel) <= budget;
      }).length,
    [all, budget],
  );

  const legend = React.useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of all) if (!seen.has(r.colorIndex)) seen.set(r.colorIndex, r.provider);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, [all]);

  return (
    <div className="rounded-[16px] border border-border bg-card p-5 sm:p-7">
      {/* ── Size tabs ──────────────────────────────────────────────── */}
      <div className="mb-5">
        <p className="t-small mb-1.5">{t("calculator.sizeLabel")}</p>
        <div
          className="flex gap-1.5"
          role="radiogroup"
          aria-label={t("calculator.sizeLabel")}
        >
          {view.sizes.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={sizeId === s.id}
              onClick={() => setSizeId(s.id)}
              className={cn(
                "flex-1 rounded-[9px] border px-3 py-2 text-[12.5px] font-medium transition-colors sm:max-w-32",
                sizeId === s.id
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-input bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`calculator.size.${s.id}`)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Budget picker ──────────────────────────────────────────── */}
      <div className="mb-5 flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="t-small mb-1">{t("costRank.budgetLabel")}</p>
          <div className="flex flex-wrap gap-1.5">
            {BUDGET_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setBudget(opt)}
                aria-pressed={budget === opt}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-medium tabular-nums transition-colors",
                  budget === opt
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.toLocaleString("en-US")}
              </button>
            ))}
          </div>
        </div>
        <p className="t-caption shrink-0 sm:text-end">
          {t("costRank.fitsCount", {
            count: affordableCount,
            total: all.length,
          })}
        </p>
      </div>

      {/* ── Bars ───────────────────────────────────────────────────── */}
      <ol className="space-y-3.5">
        {rows.map((r) => {
          const priceNum = priceLabelToNumber(r.priceLabel);
          const fits = r.isFree || priceNum <= budget;

          return (
            <li key={`${sizeId}-${r.id}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(r.colorIndex) }}
                  />
                  <span
                    className="truncate text-[14px] font-medium text-foreground"
                    title={r.name}
                  >
                    {r.name}
                  </span>
                  {!fits ? (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {t("costRank.overBudget")}
                    </span>
                  ) : null}
                </span>
                <span
                  className="shrink-0 font-mono text-[13px] tabular-nums text-foreground"
                  dir="ltr"
                >
                  {r.isFree
                    ? t("calculator.free")
                    : view.unit === "yer"
                      ? t("costRank.perMessageYer", { price: r.priceLabel })
                      : t("costRank.perMessageCredits", { price: r.priceLabel })}
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-secondary"
                aria-hidden
              >
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    !fits && "opacity-40",
                  )}
                  style={{ backgroundColor: colorFor(r.colorIndex) }}
                  initial={reduce ? false : { width: 0 }}
                  whileInView={{ width: `${r.percent}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  {...(reduce ? { animate: { width: `${r.percent}%` } } : {})}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {all.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-5 text-[13.5px] font-medium text-primary underline underline-offset-4 hover:brightness-110"
        >
          {expanded
            ? t("costRank.showLess")
            : t("costRank.showAll", { count: all.length })}
        </button>
      )}

      {legend.length > 1 && (
        <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-4">
          {legend.map(([idx, provider]) => (
            <li key={idx} className="flex items-center gap-1.5 t-caption">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: colorFor(idx) }}
              />
              {provider}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 t-caption">{t("costRank.disclaimer")}</p>
    </div>
  );
}