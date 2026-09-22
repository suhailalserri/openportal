"use client";

import { useLocale, useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { formatYer } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MagicCard } from "@/components/magicui/magic-card";
import { cn } from "@/lib/utils";
import type { CreditPackageRow } from "../types";

/**
 * apps/web/features/billing/components/package-picker.tsx (Phase 5.2)
 *
 * `billing.listPackages` (public procedure, frozen) → active
 * `creditPackages` rows, priced in YER only (F8: Moyasar/SAR disabled,
 * `formatYer` from lib/format.ts already exists for this — no new money
 * formatter added here, per Rule 1). Highest-`credits`-per-package badge
 * gets a "best value" chip; this is a client-side display heuristic only
 * (no server field for it), computed from already-fetched rows.
 *
 * Per the session's explicit ask, cards use Magic UI's `MagicCard`
 * (already vendored at components/magicui/magic-card.tsx since an
 * earlier phase — see that file's own header; not a new package.json
 * dependency, Magic UI ships as copy-in component source, not an npm
 * package) for the pointer-following spotlight, rather than a plain
 * `Card`. Selection state is a simple ring/border, not another motion
 * effect — one thing moving per card is enough.
 */

interface PackagePickerProps {
  selectedId: string | null;
  onSelect: (pkg: CreditPackageRow) => void;
}

export function PackagePicker({ selectedId, onSelect }: PackagePickerProps) {
  const t = useTranslations("billing.packages");
  const locale = useLocale() as "ar" | "en";
  const { data, isPending, isError } = trpc.billing.listPackages.useQuery();

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-[14px]" />
        ))}
      </div>
    );
  }

  if (isError || !data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const bestValueId = data.reduce((best, p) => (p.credits > best.credits ? p : best), data[0]!).id;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={t("title")}>
      {data.map((pkg) => {
        const isSelected = pkg.id === selectedId;
        const isBestValue = pkg.id === bestValueId && data.length > 1;

        return (
          <MagicCard
            key={pkg.id}
            className={cn(
              "rounded-[14px] transition-shadow",
              isSelected ? "shadow-[0_0_0_2px_var(--primary)]" : undefined
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(pkg)}
              className="flex h-full w-full flex-col gap-2 rounded-[inherit] p-[18px] text-start"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {locale === "ar" ? pkg.nameAr : pkg.name}
                </span>
                {isBestValue ? (
                  <Badge variant="success" className="gap-1">
                    <Sparkles className="size-3" aria-hidden="true" />
                    {t("bestValue")}
                  </Badge>
                ) : null}
              </div>

              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-semibold tabular-nums text-foreground">
                  {formatYer(pkg.priceYer, locale)}
                </span>
                <span className="text-sm text-muted-foreground">{t("yer")}</span>
              </div>

              <p className="text-sm text-muted-foreground">
                {t("creditsGranted", { amount: (pkg.credits / 1_000_000).toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { numberingSystem: "latn" }) })}
              </p>

              {pkg.description || pkg.descriptionAr ? (
                <p className="mt-auto text-xs text-muted-foreground">
                  {locale === "ar" ? (pkg.descriptionAr ?? pkg.description) : (pkg.description ?? pkg.descriptionAr)}
                </p>
              ) : null}
            </button>
          </MagicCard>
        );
      })}
    </div>
  );
}
