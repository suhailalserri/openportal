"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ModelBadge } from "@/components/icons/model-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compactTokens, responseSeconds } from "@/features/landing/lib/format-price";
import type { LandingModelRow, TierFilterValue } from "@/features/landing/types";

/**
 * apps/web/features/landing/components/models-table.tsx
 *
 * Phase 3.3. Replaces components/model-grid.tsx (3.2, on the DELETE
 * list). All ROWS are server-computed (LandingModelRow — see types.ts,
 * built server-side by lib/build-landing-data.ts); this component only
 * does client-side SEARCH/FILTER over an already-finished string list,
 * never any price math (Rule 1).
 *
 * Sticky first column + horizontal scroll on phones: the table's own
 * container scrolls (`overflow-x-auto` on the wrapper), and the first
 * `<td>`/`<th>` gets `sticky start-0` so the model name stays visible
 * while price/context/tags scroll under it — logical `start-0`, not
 * `left-0`, so this also sticks to the correct side in RTL.
 */

const TIER_VALUES: readonly TierFilterValue[] = ["free", "standard", "premium"];

export function ModelsTable({ rows }: { rows: LandingModelRow[] }) {
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 sm:max-w-xs">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("table.searchPlaceholder")}
            aria-label={t("table.searchPlaceholder")}
          />
        </div>
        <Select value={tier} onValueChange={(v) => setTier(v as TierFilterValue | "all")}>
          <SelectTrigger className="sm:w-44" aria-label={t("table.tierFilterLabel")}>
            <SelectValue placeholder={t("table.tierAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("table.tierAll")}</SelectItem>
            {TIER_VALUES.map((tv) => (
              <SelectItem key={tv} value={tv}>
                {t(`table.tier.${tv}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-[13px] border border-border">
        <table className="w-full min-w-[720px] caption-bottom border-collapse text-[13.5px]">
          <thead className="border-b border-input bg-card">
            <tr>
              <th className="sticky start-0 z-10 bg-card px-4 py-3 text-start font-semibold text-foreground">
                {t("table.colModel")}
              </th>
              <th className="px-4 py-3 text-start font-semibold text-foreground">{t("table.colBestFor")}</th>
              <th className="px-4 py-3 text-start font-semibold text-foreground">{t("table.colTier")}</th>
              <th className="px-4 py-3 text-start font-semibold text-foreground">{t("table.colContext")}</th>
              <th className="px-4 py-3 text-start font-semibold text-foreground">{t("table.colPrice")}</th>
              <th className="px-4 py-3 text-start font-semibold text-foreground">{t("table.colSpeed")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <ModelRow key={row.id} row={row} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t("table.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 t-caption">
        {t("table.introLine")}{" "}
        <a
          href="https://livebench.ai/#/"
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary underline underline-offset-4 hover:brightness-110"
        >
          livebench.ai
        </a>
      </p>
    </div>
  );
}

function ModelRow({ row }: { row: LandingModelRow }) {
  const t = useTranslations("landing");
  const ctx = compactTokens(row.contextWindow);
  const seconds = responseSeconds(row.responseMs);

  return (
    <tr className="border-b border-border last:border-0 transition-colors hover:bg-accent/40">
      <td className="sticky start-0 z-10 bg-card px-4 py-3 font-medium text-foreground">
        <div className="flex items-center gap-2">
          <span>{row.name}</span>
          <ModelBadge badge={row.badge} className="shrink-0" />
        </div>
        <div className="t-caption">{row.provider}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {row.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {t(`tags.${tag}`)}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={row.tier === "free" ? "success" : row.tier === "premium" ? "outline" : "secondary"}>
          {t(`table.tier.${row.tier}`)}
        </Badge>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {ctx.unit === "raw" ? ctx.value : t(`table.contextUnit.${ctx.unit}`, { value: ctx.value })}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {row.priceUnit === "yer"
          ? t("table.priceYerPerK", { in: row.priceIn, out: row.priceOut })
          : t("table.priceCreditsPerK", { in: row.priceIn, out: row.priceOut })}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {seconds === null ? t("table.speedUnknown") : t("table.speedSeconds", { seconds })}
      </td>
    </tr>
  );
}
