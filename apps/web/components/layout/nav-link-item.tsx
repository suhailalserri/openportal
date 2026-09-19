"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { isNavItemActive, type NavItem } from "@/config/nav";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { NavIcon } from "./nav-icon";

interface NavLinkItemProps {
  item: NavItem;
  /** Called after a link is followed — the drawer uses it to close itself. */
  onNavigate?: (() => void) | undefined;
}

const ROW = "flex items-center gap-3 rounded-md px-3 py-2 text-sm";

export function NavLinkItem({ item, onNavigate }: NavLinkItemProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tShell = useTranslations("shell");
  const label = tNav(item.labelKey);

  // Unbuilt route: not a link at all, so it can't be focused or followed
  // into a 404. The phase that builds the page flips `enabled` in
  // config/nav.ts (nav.test.ts checks the page file exists).
  if (!item.enabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(ROW, "cursor-not-allowed select-none text-sidebar-foreground/50")}
      >
        <NavIcon name={item.icon} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Badge variant="outline">{tShell("comingSoon")}</Badge>
      </span>
    );
  }

  const active = isNavItemActive(pathname, item);

  return (
    <Link
      href={`/${locale}${item.href}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        ROW,
        "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <NavIcon name={item.icon} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}
