"use client";

import { useLocale, useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import { LOW_BALANCE_THRESHOLD } from "@ai-platform/config";

import { trpc } from "@/lib/trpc";
import { formatCredits } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BorderBeam } from "@/components/magicui/border-beam";
import { cn } from "@/lib/utils";

/**
 * apps/web/features/billing/components/balance-card.tsx (Phase 5.1)
 *
 * The billing page's own balance display. Deliberately separate from
 * `components/layout/balance-widget.tsx` (Phase 2.2's header widget) —
 * same data (`billing.getBalance`), different job: the header widget is
 * a compact always-visible chip, this is the page's hero. Both read
 * `LOW_BALANCE_THRESHOLD` from `@ai-platform/config` (already exported
 * there since before this phase) rather than each hardcoding "10" —
 * `balance-widget.tsx`'s own header comment flagged this exact constant
 * as something to hoist "if 5.1 needs the same numbers"; it already
 * exists, so this file uses it instead of adding a third copy. (Not
 * touching `balance-widget.tsx` itself in this phase — out of scope for
 * 5.1, and it isn't broken.)
 *
 * Low/zero state gets an animated `BorderBeam` ring (Magic UI, already
 * in the repo since before this phase) in the destructive/warning color
 * — a low-key "this needs attention" cue beyond the existing badge/color
 * treatment, matching the plan's invitation to add polish here ("Success
 * animation" is explicitly called out; this is the companion "needs
 * action" cue). `BorderBeam` itself already no-ops smoothly under
 * `prefers-reduced-motion` via theme.css's global animation-duration
 * override (Session 1.1), so no extra guard is needed here.
 */
export function BalanceCard() {
  const t = useTranslations("balance");
  const locale = useLocale() as "ar" | "en";
  const { data, isPending, isError } = trpc.billing.getBalance.useQuery();

  if (isPending) {
    return (
      <Card className="relative overflow-hidden">
        <CardHeader>
          <CardTitle>{t("current")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="relative overflow-hidden">
        <CardHeader>
          <CardTitle>{t("current")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("zeroMessage")}</p>
        </CardContent>
      </Card>
    );
  }

  const isZero = data.credits <= 0;
  const isLow = !isZero && data.credits < LOW_BALANCE_THRESHOLD;
  const needsAttention = isZero || isLow;

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        isZero
          ? "border-destructive/40"
          : isLow
            ? "border-warning/40"
            : undefined
      )}
    >
      {needsAttention ? (
        <BorderBeam
          size={80}
          duration={isZero ? 4 : 7}
          colorFrom={isZero ? "var(--destructive)" : "var(--warning)"}
          colorTo={isZero ? "var(--warning)" : "var(--primary)"}
        />
      ) : null}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {t("current")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums text-foreground">
            {formatCredits(data.credits, locale)}
          </span>
          <span className="text-sm text-muted-foreground">{t("unit")}</span>
        </div>
        {needsAttention ? (
          <Badge variant={isZero ? "destructive" : "warning"}>
            {isZero ? t("zero") : t("low")}
          </Badge>
        ) : null}
      </CardContent>
      {needsAttention ? (
        <p className="px-[18px] pb-[18px] text-sm text-muted-foreground">
          {isZero ? t("zeroMessage") : t("lowMessage", { amount: formatCredits(data.credits, locale) })}
        </p>
      ) : null}
    </Card>
  );
}
