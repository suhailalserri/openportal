"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { CostRankingView, MessageSizeId } from "@/features/landing/types";

/**
 * apps/web/features/landing/components/cost-ranking.tsx
 *
 * Ported to match the reference "Cost explorer" section (Newlending.html
 * §12): a "Cheapest first / Most expensive" sort toggle plus a single
 * range-slider budget control (500–20,000, step 500), instead of the
 * old budget chip row. The chart itself (name · bar · value) is
 * unchanged in behaviour.
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

const BUDGET_MIN = 500;
const BUDGET_MAX = 20000;
const BUDGET_STEP = 500;
const DEFAULT_BUDGET = 1000;

type SortDirection = "asc" | "desc";

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
  const [sort, setSort] = React.useState<SortDirection>("asc");

  const baseRows = view.rows[sizeId] ?? [];
  // Rows already arrive cheapest-first from the server; reverse for "desc".
  const all = sort === "asc" ? baseRows : [...baseRows].reverse();
  const rows = expanded ? all : all.slice(0, COLLAPSED_COUNT);

  const affordableCount = React.useMemo(
    () =>
      baseRows.filter((r) => {
        if (r.isFree) return true;
        return priceLabelToNumber(r.priceLabel) <= budget;
      }).length,
    [baseRows, budget],
  );

  const legend = React.useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of baseRows) if (!seen.has(r.colorIndex)) seen.set(r.colorIndex, r.provider);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, [baseRows]);

  const budgetValueLabel =
    view.unit === "yer"
      ? t("costRank.budgetValueYer", { price: budget.toLocaleString("en-US") })
      : t("costRank.budgetValueCredits", { price: budget.toLocaleString("en-US") });

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

      {/* ── Toolbar: sort toggle + budget slider ─────────────────────
         Mirrors .cost-toolbar in the reference HTML: a segmented
         sort control on the left, a pill-shaped budget slider on the
         right, wrapping to a stacked layout on narrow screens. */}
      <div className="mb-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div
          className="inline-flex rounded-full border border-input bg-secondary p-1"
          role="group"
          aria-label={t("costRank.heading")}
        >
          <button
            type="button"
            aria-pressed={sort === "asc"}
            onClick={() => setSort("asc")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              sort === "asc"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("costRank.sortCheapest")}
          </button>
          <button
            type="button"
            aria-pressed={sort === "desc"}
            onClick={() => setSort("desc")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              sort === "desc"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("costRank.sortExpensive")}
          </button>
        </div>

        <div className="flex items-center gap-3.5 rounded-full border border-input bg-secondary/60 px-4 py-2 backdrop-blur-sm">
          <span className="t-small shrink-0">{t("costRank.budgetLabel")}</span>
          <input
            type="range"
            min={BUDGET_MIN}
            max={BUDGET_MAX}
            step={BUDGET_STEP}
            value={budget}
            onChange={(e) => setBudget(Number(e.currentTarget.value))}
            aria-label={t("costRank.budgetLabel")}
            className={cn(
              "h-1 w-36 shrink-0 cursor-pointer appearance-none rounded-full bg-border accent-primary",
              "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
              "[&::-webkit-slider-thumb]:shadow-[0_0_12px_var(--primary)] [&::-webkit-slider-thumb]:cursor-pointer",
              "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0",
              "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer",
            )}
          />
          <span className="shrink-0 font-mono text-[14px] font-semibold tabular-nums text-primary" dir="ltr">
            {budgetValueLabel}
          </span>
        </div>
      </div>

      <p className="t-caption mb-4">
        {t("costRank.fitsCount", { count: affordableCount, total: baseRows.length })}
      </p>

      {/* ── Bars ───────────────────────────────────────────────────── */}
      {/* Row layout matches the reference's .cost-row exactly: a fixed
          name column, a flexible bar column, a fixed value column —
          not the old stacked flex rows. */}
      <ol className="space-y-2.5">
        {rows.map((r) => {
          const priceNum = priceLabelToNumber(r.priceLabel);
          const fits = r.isFree || priceNum <= budget;

          return (
            <li
              key={`${sizeId}-${sort}-${r.id}`}
              className="grid grid-cols-1 items-center gap-2 py-2.5 sm:grid-cols-[180px_1fr_110px] sm:gap-4"
            >
              <span className="flex min-w-0 items-center gap-2 truncate text-[14px] font-medium text-foreground">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: colorFor(r.colorIndex),
                    boxShadow: `0 0 8px ${colorFor(r.colorIndex)}`,
                  }}
                />
                <span className="truncate" title={r.name}>
                  {r.name}
                </span>
                {!fits ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t("costRank.overBudget")}
                  </span>
                ) : null}
              </span>

              {/* Bar wrap — 28px bordered track, gradient fill, sweeping
                  highlight overlay (reference's .cost-bar-wrap / .cost-bar). */}
              <div className="relative h-7 overflow-hidden rounded-[8px] border border-border bg-secondary/70">
                <motion.div
                  className="relative h-full overflow-hidden rounded-[7px]"
                  style={{
                    background: r.isFree
                      ? "linear-gradient(90deg, var(--color-success), color-mix(in oklab, var(--color-success) 70%, transparent))"
                      : "linear-gradient(90deg, color-mix(in oklab, var(--primary) 65%, black), var(--primary))",
                    opacity: fits ? 1 : 0.4,
                  }}
                  initial={reduce ? false : { width: 0 }}
                  whileInView={{ width: `${r.percent}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  {...(reduce ? { animate: { width: `${r.percent}%` } } : {})}
                >
                  {!reduce && (
                    <span
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
                        animation: "cost-bar-sweep 2.5s ease-in-out infinite",
                      }}
                    />
                  )}
                </motion.div>
              </div>

              <span
                className={cn(
                  "shrink-0 text-end font-mono text-[13px] font-medium tabular-nums",
                  r.isFree ? "text-success" : "text-foreground",
                )}
                dir="ltr"
              >
                {r.isFree
                  ? t("calculator.free")
                  : view.unit === "yer"
                    ? t("costRank.perMessageYer", { price: r.priceLabel })
                    : t("costRank.perMessageCredits", { price: r.priceLabel })}
              </span>
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
