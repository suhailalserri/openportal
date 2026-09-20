"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, LogIn, RotateCw } from "lucide-react";

import { isUnauthorizedError } from "@/lib/trpc-error";
import { Button } from "@/components/ui/button";

/**
 * Phase 2.2 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * Rendered by app/[locale]/(app)/error.tsx and .../(admin)/error.tsx —
 * both route-group `error.tsx` files are Next.js error boundaries for
 * everything under them. Two ways in:
 *
 *  1. A protected tRPC query 401s while the tab is already open (2.1's
 *     known gap: layouts only guard on load). trpc-query-provider.tsx's
 *     `throwOnError` rethrows exactly this case during render, which is
 *     what a route segment's error.tsx exists to catch.
 *  2. Any other render-time error under the group (a bug, a genuinely
 *     down dependency) — generic branch, with `reset()` (Next's own
 *     retry-without-full-reload) as the primary action.
 *
 * Rule (FRONTEND_REBUILD_PLAN.md §3, security checklist): error messages
 * to users never leak stack traces or internal paths. `error.message`/
 * `error.digest` are logged to the console for local debugging only —
 * never rendered.
 */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");
  const locale = useLocale();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  if (isUnauthorizedError(error)) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 p-8 text-center">
        <LogIn aria-hidden="true" className="size-10 text-muted-foreground" />
        <p className="text-sm text-foreground">{t("sessionExpired")}</p>
        <Button asChild>
          <Link href={`/${locale}/auth/login`}>{tAuth("login")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 p-8 text-center">
      <AlertTriangle aria-hidden="true" className="size-10 text-destructive" />
      <p className="text-sm text-foreground">{t("generic")}</p>
      <Button onClick={reset}>
        <RotateCw aria-hidden="true" />
        {tCommon("tryAgain")}
      </Button>
    </div>
  );
}
