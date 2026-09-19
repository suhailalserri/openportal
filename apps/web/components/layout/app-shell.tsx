"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { AppSidebar } from "./app-sidebar";
import { Main } from "./main";
import { MobileDrawer } from "./mobile-drawer";
import { useIsMobile } from "./use-is-mobile";

interface AppShellProps {
  /** Session role, read on the server by the layout; only filters the nav. */
  role: string | null;
  children: React.ReactNode;
}

/**
 * Client half of the (app) and (admin) layouts: desktop sidebar, mobile
 * header + drawer, <main>. The server layout has already decided the
 * visitor may be here (lib/guards.ts) — nothing in this component is a
 * security boundary.
 *
 * Phase 2.2 fills the mobile header / adds a desktop top bar
 * (BalanceWidget, AccountMenu, LanguageSwitcher, ThemeToggle).
 */
export function AppShell({ role, children }: AppShellProps) {
  const t = useTranslations("shell");
  const tApp = useTranslations("app");
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Resizing from a phone-sized to a desktop-sized viewport unmounts the
  // drawer; make sure it doesn't come back already open.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t("skipToContent")}
      </a>

      <AppSidebar role={role} className="hidden md:flex" />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Plain button (not a Radix trigger), so CSS-hiding it on md+ is fine. */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("openMenu")}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <span className="text-base font-semibold">{tApp("name")}</span>
        </header>

        <Main>{children}</Main>
      </div>

      {/* Rule 3: rendered by prop, not hidden by CSS. */}
      {isMobile ? <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} role={role} /> : null}
    </div>
  );
}
