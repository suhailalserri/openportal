"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { getNavGroups } from "@/config/nav";
import { cn } from "@/lib/utils";

import { NavGroup } from "./nav-group";

interface SidebarNavProps {
  role: string | null;
  onNavigate?: (() => void) | undefined;
}

/**
 * The role-filtered nav list. Shared by the desktop sidebar and the
 * mobile drawer so the two can never show different entries.
 */
export function SidebarNav({ role, onNavigate }: SidebarNavProps) {
  const t = useTranslations("shell");
  const groups = getNavGroups(role);

  return (
    <nav aria-label={t("mainNavigation")} className="flex flex-1 flex-col gap-6 overflow-y-auto p-3">
      {groups.map((group) => (
        <NavGroup key={group.id} group={group} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

interface AppSidebarProps {
  role: string | null;
  className?: string | undefined;
}

/**
 * Desktop sidebar. Plain markup with no Radix inside, so hiding it below
 * `md` with CSS is safe under Rule 3 (only context-dependent Radix
 * primitives must be conditionally rendered).
 */
export function AppSidebar({ role, className }: AppSidebarProps) {
  const locale = useLocale();
  const tApp = useTranslations("app");

  return (
    <aside
      className={cn(
        "sticky top-0 h-dvh w-64 shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        <Link
          href={`/${locale}/chat`}
          className="rounded-md text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {tApp("name")}
        </Link>
      </div>
      <SidebarNav role={role} />
    </aside>
  );
}
