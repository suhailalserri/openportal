"use client";

import { useTranslations } from "next-intl";
import { ListX } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * apps/web/features/usage/components/usage-empty-state.tsx (Phase 6.2)
 *
 * Same card shell as `features/dashboard/components/dashboard-empty-state.tsx`
 * (6.1) but its own copy/icon: this one can be reached either from "never
 * used the platform" (matches the dashboard's case) OR "filters currently
 * exclude everything" (a model/date-range combo with no matches) — the
 * copy below covers both without implying the account has no history.
 */
export function UsageEmptyState() {
  const t = useTranslations("usage.empty");

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <ListX className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{t("title")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("description")}</p>
      </CardContent>
    </Card>
  );
}
