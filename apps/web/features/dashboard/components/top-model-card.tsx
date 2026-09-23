"use client";

import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import { SpotlightCard } from "@/components/magicui/spotlight-card";
import { InfoHint } from "@/components/shared/info-hint";
import { useModelCatalog } from "../hooks/use-model-catalog";
import type { UsageSummary } from "../types";

interface TopModelCardProps {
  summary: UsageSummary | undefined;
  isLoading: boolean;
}

/**
 * apps/web/features/dashboard/components/top-model-card.tsx (Phase 6.1 polish)
 *
 * Moved OUT of the equal-weight SummaryCards grid per explicit feedback
 * ("make it on the top and highlight the model") — this is now its own
 * full-width banner rendered above the grid (dashboard/index.tsx), using
 * the new `SpotlightCard` module (MagicCard's pointer-glow + BorderBeam's
 * animated ring) so it visually reads as "the standout number on this
 * page" rather than one more identical tile.
 *
 * `topModelId` is a raw id from the frozen backend (usage.service.ts);
 * joined against `models.list` via `useModelCatalog` for a display name
 * + badge. If the id isn't in the (published-only) catalog — e.g. a
 * model used earlier in the period but since unpublished — this falls
 * back to the raw id in `dir="ltr"`, exactly what the plain grid cell did
 * before this change (never silently blank).
 */
export function TopModelCard({ summary, isLoading }: TopModelCardProps) {
  const locale = useLocale() as "ar" | "en";
  const t = useTranslations("dashboard.topModel");
  const tCards = useTranslations("dashboard.cards");
  const { byId } = useModelCatalog();

  const modelId = summary?.topModelId ?? null;
  const catalogEntry = modelId ? byId.get(modelId) : undefined;
  const displayName = catalogEntry
    ? locale === "ar"
      ? catalogEntry.displayNameAr
      : catalogEntry.displayName
    : modelId;

  return (
    <SpotlightCard className="w-full">
      <div className="flex items-center justify-between gap-2">
        <AnimatedShinyText className="mx-0 max-w-none text-xs font-semibold">
          {tCards("topModel")}
        </AnimatedShinyText>
        <InfoHint label={t("hintLabel")} content={t("hint")} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {isLoading ? (
          <Skeleton className="h-7 w-40" />
        ) : displayName ? (
          <>
            <p
              className="truncate text-xl font-semibold text-foreground"
              dir={catalogEntry ? undefined : "ltr"}
            >
              {displayName}
            </p>
            {catalogEntry?.badge ? <Badge variant="outline">{catalogEntry.badge}</Badge> : null}
          </>
        ) : (
          <p className="text-xl font-semibold text-muted-foreground">{tCards("none")}</p>
        )}
      </div>
    </SpotlightCard>
  );
}
