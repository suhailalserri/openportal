"use client";

import { useLocale, useTranslations } from "next-intl";
import { Wallet } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { formatCredits } from "@/lib/format";
import { NAV_GROUPS } from "@/config/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Phase 2.2 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * Thresholds from AI_Aggregator_Master_Plan_v2.md §22.3 ("Conversion
 * nudges"): amber under 10 credits, hard/destructive at exactly 0.
 * Kept as local constants — there's no shared "billing constants" module
 * yet (billing itself doesn't exist until 5.1). If 5.1 needs the same
 * numbers, hoist them then; duplicating a magic number across two
 * unrelated phases is a smaller risk than adding a shared module for
 * a single pair of constants today.
 */
const LOW_BALANCE_THRESHOLD_CREDITS = 10;

/**
 * Rule 1 (FRONTEND_REBUILD_PLAN.md §3): money is never computed
 * client-side. `data.credits` is the raw micro-credit integer;
 * `formatCredits` is the one conversion point. `data.displayCredits`
 * (the server's own pre-divided float) is deliberately NOT read here —
 * two call sites doing the same division independently is exactly the
 * drift Rule 1 exists to prevent.
 */
interface BalanceWidgetProps {
  /** Mobile header: drop the unit label and the "Soon" badge to stay narrow. */
  compact?: boolean;
}

export function BalanceWidget({ compact = false }: BalanceWidgetProps) {
  const t = useTranslations("balance");
  const locale = useLocale() as "ar" | "en";
  const { data, isPending, isError } = trpc.billing.getBalance.useQuery();

  // billing.getBalance is a protectedProcedure; an UNAUTHORIZED response
  // is rethrown by the QueryClient's throwOnError (trpc-query-provider.tsx)
  // into (app)/error.tsx before this ever renders isError — so isError
  // here means a real, non-auth failure (network, 500, etc).
  const billingEnabled =
    NAV_GROUPS.find((g) => g.id === "main")?.items.find((i) => i.id === "billing")?.enabled ?? false;

  if (isPending) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  if (isError || !data) {
    // Non-auth failure: fail quiet rather than blank the header for a
    // widget that isn't the reason the user is on this page.
    return null;
  }

  const credits = data.credits / 1_000_000;
  const isZero = credits <= 0;
  const isLow = !isZero && credits < LOW_BALANCE_THRESHOLD_CREDITS;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border text-sm",
        compact ? "px-2 py-1" : "px-3 py-1.5",
        isZero
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : isLow
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-border bg-card text-foreground"
      )}
      title={isZero ? t("zeroMessage") : isLow ? t("lowMessage", { amount: formatCredits(data.credits, locale) }) : t("current")}
    >
      <Wallet aria-hidden="true" className="size-4 shrink-0" />
      <span className="font-medium tabular-nums">{formatCredits(data.credits, locale)}</span>
      {/* compact (mobile header): unit label dropped to stay narrow — the
          amount alone is enough context there; the `title` tooltip and
          full-size render elsewhere still carry the unit. */}
      {compact ? null : <span className="text-xs opacity-80">{t("unit")}</span>}
      {(isZero || isLow) && !billingEnabled && !compact ? (
        // Real CTA arrives with 5.1's /billing page. Until then: same
        // disabled/"Soon" treatment nav-link-item.tsx already gives an
        // unbuilt route, reusing config/nav.ts's own flag as the single
        // source of truth for "is billing built" rather than a second one.
        // Dropped in compact mode along with the unit label, per this
        // component's own prop doc — the color state (amber/red border)
        // already carries the signal at header width.
        <Badge variant={isZero ? "destructive" : "warning"} className="ms-1">
          {isZero ? t("zero") : t("low")}
        </Badge>
      ) : null}
    </div>
  );
}
