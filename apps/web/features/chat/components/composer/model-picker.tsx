"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AppProviderIcon } from "@/components/icons/provider-icon";
import { ModelBadge } from "@/components/icons/model-badge";
import { ModelCategoryIcons, LEADERBOARD_CATEGORY_ICONS } from "@/components/icons/model-category";
import {
  formatLatency,
  formatTokenSize,
  modelDisplayName,
  type ChatModel,
} from "../../lib/model-selection";
import {
  availableCategoryTabs,
  rankModelsForCategory,
  resolveCategoryScore,
  type LeaderboardCategoryKey,
} from "../../lib/model-ranking";
import { unitPrice } from "../../lib/cost-estimate";

/**
 * apps/web/features/chat/components/composer/model-picker.tsx
 *
 * Phase 4c (rework). The model picker is now two pieces that live INSIDE
 * the composer's bottom toolbar:
 *  - <ModelChip>  the round-ended pill that shows the current model and
 *                 opens the panel;
 *  - <ModelList>  the rows shown in the inline panel (composer-panel.tsx).
 * Both are presentational — the model list and selection come in as props
 * (data fetching lives in ../../hooks/use-chat-models), so this file
 * renders in the /dev fixture with no tRPC.
 *
 * This replaces the earlier Radix <Select>. That removes the workaround it
 * needed (Radix mirrors an item's text into the closed trigger, so rich
 * rows couldn't be used) and the unverified `SelectValue` behaviour noted
 * in BRANCH_AND_CI_NOTES.md: an inline listbox can show name, tier,
 * context, price and latency on every row.
 *
 * PRICES are DISPLAY credits per 1K tokens (not micro-credits; never pass
 * through formatCredits()). They come from `unitPrice()`, which prefers an
 * exact fractional figure when the API provides one and otherwise uses the
 * API's rounded-up whole number — so for a cheap model the list can read
 * higher than the true rate.
 *
 * LISTBOX KEYBOARD: roving tabindex (the selected row is the tab stop),
 * ↑/↓/Home/End move focus, Enter/Space (native button click) select.
 * Focus moves to the selected row when the list mounts.
 */

function formatPrice(n: number, locale: "ar" | "en"): string {
  return n.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
    numberingSystem: "latn",
    maximumFractionDigits: 2,
  });
}

export interface ModelChipProps extends Omit<React.ComponentProps<"button">, "children"> {
  model: ChatModel | undefined;
  open: boolean;
  /** id of the panel this chip opens. */
  controls: string;
}

export function ModelChip({ model, open, controls, className, ...props }: ModelChipProps) {
  const t = useTranslations("chat");
  const locale = useLocale() === "ar" ? "ar" : "en";
  return (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={t("selectModel")}
      className={cn(
        "flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full bg-secondary ps-3.5 pe-2.5 text-[13.5px] font-medium text-foreground outline-none transition-[background-color,transform] duration-150",
        "hover:not-disabled:bg-border active:not-disabled:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-45",
        open && "bg-accent",
        className,
      )}
      {...props}
    >
      {model ? (
        <AppProviderIcon
          providerIconKey={model.providerIconKey}
          provider={model.provider}
          size={14}
          className="shrink-0"
        />
      ) : null}
      <span className="truncate">{model ? modelDisplayName(model, locale) : t("selectModel")}</span>
      {model?.badge ? <ModelBadge badge={model.badge} size={11} iconOnly /> : null}
      <ChevronDown
        aria-hidden
        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
      />
    </button>
  );
}

export interface ModelListProps {
  models: readonly ChatModel[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

/**
 * Round category tabs (same pill shape/style as <ModelChip>: rounded-full,
 * bg-secondary at rest, bg-accent when active) fixed to the top of the
 * model panel, above a scrolling ranked list — see model-ranking.ts for
 * how "ranked" is computed. Only categories with at least one scored
 * model get a tab, so an admin who hasn't entered scores yet still sees
 * a working (unranked, insertion-order) "All" list rather than a wall of
 * empty tabs.
 */
export function ModelList({ models, selectedId, onSelect }: ModelListProps) {
  const t = useTranslations("chat");
  const tm = useTranslations("models");
  const tc = useTranslations("admin.modelsPage.leaderboardCategories");
  const locale = useLocale() === "ar" ? "ar" : "en";
  const listRef = React.useRef<HTMLDivElement>(null);

  const tabs = React.useMemo(() => availableCategoryTabs(models), [models]);
  const [activeTab, setActiveTab] = React.useState<LeaderboardCategoryKey>("overall");
  const tab: LeaderboardCategoryKey = tabs.includes(activeTab) ? activeTab : (tabs[0] ?? "overall");

  const ranked = React.useMemo(() => rankModelsForCategory(models, tab), [models, tab]);
  const topScore = ranked[0] ? resolveCategoryScore(ranked[0], tab) : undefined;

  // Put keyboard focus on the current model when the list (re)renders for
  // a tab change, falling back to the top-ranked row.
  React.useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const target =
      root.querySelector<HTMLElement>('[role="option"][aria-selected="true"]') ??
      root.querySelector<HTMLElement>('[role="option"]');
    target?.focus();
  }, [tab]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const root = listRef.current;
    if (!root) return;
    const options = Array.from(root.querySelectorAll<HTMLElement>('[role="option"]'));
    const index = options.findIndex((o) => o === document.activeElement);
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(options.length - 1, index + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next >= 0) {
      e.preventDefault();
      options[next]?.focus();
    }
  };

  const hasSelected = ranked.some((m) => m.id === selectedId);

  return (
    <div className="flex flex-col gap-2">
      {tabs.length > 1 ? (
        <div
          role="tablist"
          aria-label={tc("tablistLabel")}
          className="sticky top-0 z-10 -mx-3 -mt-3 flex gap-1.5 overflow-x-auto bg-card px-3 pb-2 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((key) => {
            const Icon = LEADERBOARD_CATEGORY_ICONS[key];
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none transition-colors",
                  "hover:not-disabled:bg-border focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-accent text-accent-foreground",
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {tc(key)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        ref={listRef}
        role="listbox"
        aria-label={t("selectModel")}
        onKeyDown={handleKeyDown}
        className="flex flex-col gap-0.5"
      >
        {ranked.map((m, i) => {
          const selected = m.id === selectedId;
          const latency = formatLatency(m.avgResponseTimeMs);
          const priceIn = unitPrice(m, "input").perK;
          const priceOut = unitPrice(m, "output").perK;
          const isFree = priceIn === 0 && priceOut === 0;
          const score = resolveCategoryScore(m, tab);
          const isTop = i === 0 && topScore !== undefined;
          return (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={selected || (!hasSelected && i === 0) ? 0 : -1}
              onClick={() => onSelect(m.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-start outline-none transition-colors",
                "hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                selected && "bg-accent",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
                  <AppProviderIcon
                    providerIconKey={m.providerIconKey}
                    provider={m.provider}
                    size={15}
                    className="shrink-0"
                  />
                  <span className="truncate">{modelDisplayName(m, locale)}</span>
                  {m.badge ? <ModelBadge badge={m.badge} size={11} /> : null}
                  {isFree ? (
                    <ModelBadge badge="free" size={11} />
                  ) : (
                    <Badge variant={m.tier === "premium" ? "default" : "secondary"}>
                      {m.tier === "premium" ? tm("premium") : tm("standard")}
                    </Badge>
                  )}
                  {isTop ? (
                    <Badge variant="outline" className="border-primary text-primary">
                      {tc("topPick")}
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-faint-foreground">
                  {score !== undefined ? (
                    <span title={tc("scoreTooltip", { category: tc(tab) })}>
                      {tc(tab)}{" "}
                      <span className="font-semibold text-foreground">{score.toFixed(1)}</span>
                    </span>
                  ) : null}
                  <span>
                    {tm("contextWindow")}{" "}
                    <span className="text-muted-foreground">{formatTokenSize(m.contextWindow)}</span>
                  </span>
                  <span title={tm("perThousand")}>
                    {tm("priceInput")}{" "}
                    <span className="text-muted-foreground">{formatPrice(priceIn, locale)}</span>
                    {" · "}
                    {tm("priceOutput")}{" "}
                    <span className="text-muted-foreground">{formatPrice(priceOut, locale)}</span>
                  </span>
                  <span title={tm("latencyTooltip")} className="text-muted-foreground">
                    {latency ?? "—"}
                  </span>
                </span>
                {m.categories && m.categories.length > 0 ? (
                  <ModelCategoryIcons categories={m.categories} size={12} className="mt-1" />
                ) : null}
              </span>
              <Check
                aria-hidden
                className={cn("mt-0.5 size-4 shrink-0 text-primary", selected ? "opacity-100" : "opacity-0")}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
