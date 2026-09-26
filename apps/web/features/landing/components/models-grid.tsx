"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { compactTokens, responseSeconds } from "@/features/landing/lib/format-price";
import type { LandingModelRow, TierFilterValue } from "@/features/landing/types";
import { cn } from "@/lib/utils";

/**
 * apps/web/features/landing/components/models-grid.tsx
 *
 * Phase 3.3+ (redesign). Replaces components/models-table.tsx: same
 * server-computed rows, presented as a responsive card grid instead of
 * a horizontally scrolling table. Search and tier filter behave
 * identically to the table (client-side filter over an already-finished
 * string list — Rule 1: no price math here).
 *
 * Zero new i18n keys: reuses the `landing.table.*`, `landing.models.*`,
 * `landing.tags.*`, and `landing.yer` strings that already existed for
 * the table.
 */

const TIER_VALUES: readonly TierFilterValue[] = ["free", "standard", "premium"];

const PROVIDER_ABBR: Record<string, string> = {
  openai: "OA",
  anthropic: "AN",
  google: "GO",
  deepseek: "DS",
  alibaba: "AL",
  meta: "ME",
  mistral: "MI",
  xai: "XA",
  qwen: "QW",
};

function providerAbbr(provider: string): string {
  return PROVIDER_ABBR[provider.toLowerCase()] ?? provider.slice(0, 2).toUpperCase();
}

export function ModelsGrid({ rows }: { rows: LandingModelRow[] }) {
  const t = useTranslations("landing");
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = React.useState<TierFilterValue | "all">("all");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tier !== "all" && r.tier !== tier) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.provider.toLowerCase().includes(q) ||
        r.tags.some((tag) => t(`tags.${tag}`).toLowerCase().includes(q))
      );
    });
  }, [rows, query, tier, t]);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 sm:max-w-xs">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("table.searchPlaceholder")}
            aria-label={t("table.searchPlaceholder")}
          />
        </div>

        <div
          role="tablist"
          aria-label={t("table.tierFilterLabel")}
          className="flex gap-1 self-start rounded-[10px] border border-input bg-secondary p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tier === "all"}
            onClick={() => setTier("all")}
            className={cn(
              "rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              tier === "all"
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("table.tierAll")}
          </button>
          {TIER_VALUES.map((tv) => (
            <button
              key={tv}
              type="button"
              role="tab"
              aria-selected={tier === tv}
              onClick={() => setTier(tv)}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                tier === tv
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`table.tier.${tv}`)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-[13.5px] text-muted-foreground">
          {t("table.noResults")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row) => (
            <ModelCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelCard({ row }: { row: LandingModelRow }) {
  const t = useTranslations("landing");
  const ctx = compactTokens(row.contextWindow);
  const seconds = responseSeconds(row.responseMs);

  const ctxLabel =
    ctx.unit === "raw"
      ? String(ctx.value)
      : t(`table.contextUnit.${ctx.unit}`, { value: ctx.value });

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[14px] border border-border bg-card p-5",
        "transition-[transform,border-color,box-shadow] duration-300",
        "hover:-translate-y-0.5 hover:border-primary/40",
        "hover:shadow-[0_12px_32px_-16px_var(--color-primary)]",
      )}
    >
      <header className="mb-4 flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-secondary font-mono text-[12px] font-bold text-foreground">
          {providerAbbr(row.provider)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
            <span className="truncate">{row.name}</span>
            {row.badge ? (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {row.badge}
              </Badge>
            ) : null}
          </h3>
          <p
            className={cn(
              "mt-0.5 text-[10.5px] font-semibold tracking-widest uppercase",
              row.tier === "free" && "text-success",
              row.tier === "premium" && "text-destructive",
              row.tier === "standard" && "text-muted-foreground",
            )}
          >
            {t(`table.tier.${row.tier}`)} · {row.provider}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 border-y border-border py-3">
        <Stat label={t("table.colContext")} value={ctxLabel} />
        <Stat
          label={t("table.colSpeed")}
          value={seconds === null ? t("table.speedUnknown") : `${seconds}s`}
        />
        <Stat
          label={t("models.priceInput")}
          value={`${row.priceIn} ${t("yer")}`}
        />
        <Stat
          label={t("models.priceOutput")}
          value={`${row.priceOut} ${t("yer")}`}
        />
      </div>

      {row.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {row.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
            >
              {t(`tags.${tag}`)}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 truncate font-mono text-[12.5px] font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}