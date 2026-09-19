import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Phase 2.2 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * Rendered by app/[locale]/(app)/not-found.tsx and .../(admin)/not-found.tsx.
 * Server component (no interactivity needed) — `not-found.tsx` renders
 * INSIDE the group's layout (the shell is still around it), so this is
 * only the content area, not a full page.
 *
 * Always links to /chat, not `router.back()`: a 404 has no reliable
 * "back" (deep link, typo, stale bookmark) — /chat is the one route
 * every signed-in visitor can always reach (2.1's guard already got
 * them past the sign-in check to be here at all).
 */
export async function RouteNotFound() {
  const locale = await getLocale();
  const t = await getTranslations("errors");

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 p-8 text-center">
      <FileQuestion aria-hidden="true" className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">{t("notFoundTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("notFoundMessage")}</p>
      </div>
      <Button asChild>
        <Link href={`/${locale}/chat`}>{t("backToChat")}</Link>
      </Button>
    </div>
  );
}
