"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LogOut, Settings, User } from "lucide-react";

import { useSession, signOut } from "@/lib/auth-client";
import { clearAllClientCaches } from "@/lib/client-cache";
import { NAV_GROUPS } from "@/config/nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Phase 2.2 (docs/FRONTEND_REBUILD_PLAN.md).
 *
 * Settings is reached through the same `enabled` flag config/nav.ts uses
 * for the sidebar (7.1 flips it) — one source of truth for "is this
 * route built yet" instead of a second, easily-forgotten check here.
 *
 * "Sign out" always works today: better-auth's signOut doesn't depend on
 * any of the unbuilt pages. `router.push` (not router.replace) so the
 * browser back button doesn't return to a page that immediately
 * redirects back to login anyway.
 *
 * Phase 3.2 addition: clearAllClientCaches() (lib/client-cache.ts) runs
 * before signOut() — Rule 9 (FRONTEND_REBUILD_PLAN.md §3), "clear
 * per-user client caches on sign-out... shared-device privacy." Today
 * that only clears the consent-banner dismissal flag (its only
 * registrant so far); Phase 4d's IndexedDB conversation cache registers
 * here too once it exists, with no further change needed in this file.
 */
export function AccountMenu() {
  const t = useTranslations("shell");
  const tNav = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const settingsEnabled =
    NAV_GROUPS.find((g) => g.id === "main")?.items.find((i) => i.id === "settings")?.enabled ?? false;

  if (!session?.user) return null;

  const { name, email, image } = session.user;
  const initials = (name || email || "?").trim().slice(0, 1).toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await clearAllClientCaches();
      await signOut();
    } finally {
      router.push(`/${locale}/auth/login`);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("accountMenu")}
          className="rounded-full"
        >
          <Avatar className="size-8">
            {/* exactOptionalPropertyTypes: AvatarImage's `src` is an
                optional prop — passing `src={undefined}` explicitly is a
                type error (same class as nav-link-item.tsx/message-actions.tsx
                fixes in 2.1/restyle), so the prop is only spread when a
                real value exists rather than always passed with a
                possibly-undefined value. */}
            <AvatarImage {...(image ? { src: image } : {})} alt="" />
            <AvatarFallback>
              {initials || <User aria-hidden="true" className="size-4" />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {t("signedInAs", { email: email ?? "" })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!settingsEnabled} asChild={settingsEnabled}>
          {settingsEnabled ? (
            <Link href={`/${locale}/settings`}>
              <Settings aria-hidden="true" />
              {tNav("settings")}
            </Link>
          ) : (
            <span className="flex items-center gap-2">
              <Settings aria-hidden="true" />
              {tNav("settings")}
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={signingOut} onSelect={handleSignOut}>
          <LogOut aria-hidden="true" />
          {tNav("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
