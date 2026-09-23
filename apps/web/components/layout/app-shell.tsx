"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { conversationPath } from "@/features/chat/lib/new-chat";

import { AccountMenu } from "./account-menu";
import { AppSidebar } from "./app-sidebar";
import { BalanceWidget } from "./balance-widget";
import { LanguageSwitcher } from "./language-switcher";
import { Main } from "./main";
import { MobileDrawer } from "./mobile-drawer";
import { ThemeToggle } from "./theme-toggle";
import { useIsMobile } from "./use-is-mobile";

interface AppShellProps {
  /** Session role, read on the server by the layout; only filters the nav. */
  role: string | null;
  children: React.ReactNode;
}

// Matches "/chat/<segment>" and captures the segment — used only to
// decide which conversation (if any) is "active" for the embedded
// sidebar/drawer list. "/chat" and "/chat/all" both correctly resolve
// to `undefined` below (the latter is excluded explicitly, since it's a
// real path segment that this regex alone can't tell apart from a
// conversation id).
const CHAT_ID_PATTERN = /\/chat\/([^/?#]+)/;

/**
 * Client half of the (app) and (admin) layouts: desktop sidebar, mobile
 * header + drawer, <main>. The server layout has already decided the
 * visitor may be here (lib/guards.ts) — nothing in this component is a
 * security boundary.
 *
 * Phase 4d Patch v2: `AppSidebar`/`MobileDrawer` now embed the
 * conversation list on every route (not just the two chat pages), so
 * this is where `activeConversationId`/`onSelectConversation`/
 * `onNewChat` are derived — once, at the shell level — from
 * `usePathname()`/`useRouter()`, and handed to both. Neither chat page
 * owns a `ConversationSidebar` of its own any more (see their own
 * header comments).
 */
export function AppShell({ role, children }: AppShellProps) {
  const t = useTranslations("shell");
  const tApp = useTranslations("app");
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  // Resizing from a phone-sized to a desktop-sized viewport unmounts the
  // drawer; make sure it doesn't come back already open.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  const chatIdMatch = pathname.match(CHAT_ID_PATTERN);
  const activeConversationId = chatIdMatch && chatIdMatch[1] !== "all" ? chatIdMatch[1] : undefined;

  const selectConversation = (id: string) => router.push(conversationPath(locale, id));
  const startNewChat = () => router.push(`/${locale}/chat`);

  return (
    // `h-dvh overflow-hidden` (was `min-h-dvh`, no overflow rule) — the
    // other half of the mobile chat-composer fix, paired with `Main`'s
    // own comment. `min-h-dvh` let this root grow taller than the
    // viewport to fit its content, which is what made the WHOLE PAGE
    // scroll on mobile (composer included) instead of just the message
    // list. A fixed `h-dvh` (the dynamic-viewport-height unit — correct
    // for mobile browser chrome show/hide, matching `AppSidebar`'s own
    // `h-dvh`) plus `overflow-hidden` forces every descendant that needs
    // more room than the viewport gives it to scroll INTERNALLY instead
    // of pushing this root taller — `Main`'s own `overflow-y-auto` is
    // where that internal scrolling actually happens for every page
    // except chat, which handles it one level deeper still
    // (`MessageList`), so the composer never moves.
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t("skipToContent")}
      </a>

      <AppSidebar
        role={role}
        activeConversationId={activeConversationId}
        onSelectConversation={selectConversation}
        onNewChat={startNewChat}
        className="hidden md:flex print:hidden"
      />

      {/* min-h-0: without it, a flex child's default min-height:auto would
          let this column grow to fit Main's content instead of respecting
          the fixed-height root above — same reasoning as Main's own
          min-h-0. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/*
          Always rendered (not md:hidden like before Phase 2.2): the
          desktop sidebar has no footer/account area, so this is also
          the desktop top bar for BalanceWidget/LanguageSwitcher/
          ThemeToggle/AccountMenu. Only the leading menu-button + app-name
          pair is mobile-only (the sidebar already shows the app name on
          desktop). The menu button is a plain button (not a Radix
          trigger), so CSS-hiding it on md+ is fine under Rule 3 — only
          MobileDrawer itself (Radix Sheet) has to be conditionally
          rendered, not this trigger.
        */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 print:hidden">
          <div className="flex items-center gap-2 md:hidden">
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
          </div>

          {/* compact on mobile: drop the unit label / "Soon" badge to stay narrow. */}
          <div className="ms-auto flex items-center gap-1">
            <BalanceWidget compact={isMobile} />
            <LanguageSwitcher />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </header>

        <Main>{children}</Main>
      </div>

      {/* Rule 3: rendered by prop, not hidden by CSS. */}
      {isMobile ? (
        <MobileDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          role={role}
          activeConversationId={activeConversationId}
          onSelectConversation={selectConversation}
          onNewChat={startNewChat}
        />
      ) : null}
    </div>
  );
}
