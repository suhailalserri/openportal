"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import type { NavGroup as NavGroupConfig } from "@/config/nav";

import { NavLinkItem } from "./nav-link-item";

interface NavGroupProps {
  group: NavGroupConfig;
  onNavigate?: (() => void) | undefined;
}

export function NavGroup({ group, onNavigate }: NavGroupProps) {
  const t = useTranslations("nav");
  const headingId = useId();

  return (
    <section aria-labelledby={group.labelKey ? headingId : undefined}>
      {group.labelKey ? (
        <h2 id={headingId} className="px-3 pb-2 text-xs font-medium text-sidebar-foreground/70">
          {t(group.labelKey)}
        </h2>
      ) : null}
      <ul className="flex flex-col gap-1">
        {group.items.map((item) => (
          <li key={item.id}>
            <NavLinkItem item={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </section>
  );
}
