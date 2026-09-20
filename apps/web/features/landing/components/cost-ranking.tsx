"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { CostRankingView, MessageSizeId } from "@/features/landing/types";

/**
 * apps/web/features/landing/components/cost-ranking.tsx
 *
 * Phase 3.3. "Cost, ranked": one bar per model, cheapest first, showing
 * what ONE message costs on every model the platform offers. Every
 * price and bar width arrives finished from the server
 * (build-landing-data.ts buildCostRanking) — this component only picks
 * the message size and draws (Rule 1: no money maths client-side).
 *
 * Colours: one per PROVIDER (colorIndex from the server), so a visitor
 * can see e.g. all Anthropic models at a glance. Bars grow once when
 * scrolled into view; reduced motion draws them at full width.
 */

const PROVIDER_COLORS = [
  "#7C3AED", // violet
  "#EF4444", // red
  "#0F172A", // ink
  "#3B5FB5", // blue
  "#F59E0B", // amber
  "#EC4899", // pink
  "#10A37F", // green
  "#CC785C", // clay
] as const;

const COLLAPSED_COUNT = 12;

function colorFor(index: number): string {
  return PROVIDER_COLORS[((index % PROVIDER_COLORS.length) + PROVIDER_COLORS.length) % PROVIDER_COLORS.length] ?? "#888";
}

export function CostRanking({ view }: { view: CostRankingView }) {
  const t = useTranslations("landing");
  const reduce = useReducedMotion();
  const [sizeId, setSizeId] = React.useState<MessageSizeId>(
    view.sizes.find((s) => s.id === "medium")?.id ?? view.sizes[0]?.id ?? "short",
  );
  const [expanded, setExpanded] = React.useState(false);

  const all = view.rows[sizeId] ?? [];
  const rows = expanded ? all : all.slice(0, COLLAPSED_COUNT);

  const legend = React.useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of all) if (!seen.has(r.colorIndex)) seen.set(r.colorIndex, r.provider);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, [all]);

  return (
    <div className="rounded-[16px] border border-border bg-card p-5 sm:p-7">
      <div className="mb-5">
        <p className="t-small mb-1.5">{t("calculator.sizeLabel")}</p>
        <div className="flex gap-1.5" role="radiogroup" aria-label={t("calculator.sizeLabel")}>
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

      <ol className="space-y-3.5">
        {rows.map((r) => (
          <li key={`${sizeId}-${r.id}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorFor(r.colorIndex) }}
                />
                <span className="truncate text-[14px] font-medium text-foreground" title={r.name}>
                  {r.name}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground" dir="ltr">
                {r.isFree
                  ? t("calculator.free")
                  : view.unit === "yer"
                    ? t("costRank.perMessageYer", { price: r.priceLabel })
                    : t("costRank.perMessageCredits", { price: r.priceLabel })}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: colorFor(r.colorIndex) }}
                initial={reduce ? false : { width: 0 }}
                whileInView={{ width: `${r.percent}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                {...(reduce ? { animate: { width: `${r.percent}%` } } : {})}
              />
            </div>
          </li>
        ))}
      </ol>

      {all.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-5 text-[13.5px] font-medium text-primary underline underline-offset-4 hover:brightness-110"
        >
          {expanded ? t("costRank.showLess") : t("costRank.showAll", { count: all.length })}
        </button>
      )}

      {legend.length > 1 && (
        <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-4">
          {legend.map(([idx, provider]) => (
            <li key={idx} className="flex items-center gap-1.5 t-caption">
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: colorFor(idx) }} />
              {provider}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 t-caption">{t("costRank.disclaimer")}</p>
    </div>
  );
}
