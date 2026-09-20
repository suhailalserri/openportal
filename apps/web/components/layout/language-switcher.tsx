"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Phase 2.2 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * No `createNavigation`/locale-aware `Link` from next-intl: this app
 * uses a custom middleware.ts, not next-intl's own routing (see its
 * comment), so the locale segment is a plain, always-present part of
 * `usePathname()` here — the same assumption nav-link-item.tsx and
 * safe-redirect.ts already make. Swapping it is a plain string
 * replace, not a next-intl navigation call.
 *
 * A real `<Link>` (not a client-side `router.push`) so the target
 * locale is announced as a normal navigable URL and works with
 * middle-click / open-in-new-tab.
 *
 * `useSearchParams()` normally needs a Suspense boundary to avoid
 * opting an otherwise-static route out of prerendering — not needed
 * here: this only ever renders inside (app)/(admin), whose layouts
 * already call `headers()` (lib/session.ts) and are dynamic on every
 * request regardless of this component.
 */
const OTHER_LOCALE: Record<string, string> = { ar: "en", en: "ar" };

export function LanguageSwitcher() {
  const t = useTranslations("shell");
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const target = OTHER_LOCALE[locale] ?? "ar";
  const rest = pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  const query = searchParams.toString();
  const href = `/${target}${rest}${query ? `?${query}` : ""}`;

  return (
    <Button variant="ghost" size="icon" aria-label={t("language")} asChild>
      <Link href={href} hrefLang={target}>
        <Languages aria-hidden="true" />
        <span className="sr-only">{target.toUpperCase()}</span>
      </Link>
    </Button>
  );
}
