"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { getNavGroups } from "@/config/nav";
import { cn } from "@/lib/utils";
import { ConversationSidebar } from "@/features/chat/components/sidebar/conversation-sidebar";

import { NavGroup } from "./nav-group";

/** Rows shown above the "View all chats →" link, both on the desktop
 *  sidebar and inside the mobile drawer — kept as one constant so the
 *  two surfaces can never silently drift to different caps. */
const CONVERSATION_LIST_LIMIT = 10;

interface SidebarNavProps {
  role: string | null;
  /** Phase 4d Patch v2: the embedded conversation list's own state,
   *  threaded down from `AppShell` (shell-level, since this now renders
   *  on every route, not just the two chat pages). */
  activeConversationId: string | undefined;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onNavigate?: (() => void) | undefined;
}

/**
 * The role-filtered nav list, now conversation-aware (Phase 4d Patch
 * v2). Shared by the desktop sidebar and the mobile drawer so the two
 * can never show different content: New Chat → search → capped
 * conversation list (10, pinned first) → "View all chats →" → divider →
 * flat Billing / Dashboard / Settings links, then the role-gated Admin
 * group — both straight from `config/nav.ts`, unchanged filtering logic.
 *
 * "chat" IS NOT in `NAV_GROUPS` (removed from config/nav.ts by this
 * patch) — the embedded conversation list above already owns that
 * destination; a second "Chat" link pointing at the same place would be
 * redundant, which is exactly what the phase plan called for.
 */
export function SidebarNav({
  role,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onNavigate,
}: SidebarNavProps) {
  const t = useTranslations("shell");
  const groups = getNavGroups(role);

  return (
    <nav aria-label={t("mainNavigation")} className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
      <ConversationSidebar
        activeConversationId={activeConversationId}
        onSelect={(id) => {
          onSelectConversation(id);
          onNavigate?.();
        }}
        onNewChat={() => {
          onNewChat();
          onNavigate?.();
        }}
        limit={CONVERSATION_LIST_LIMIT}
        // Embedded: no border/fixed-width/full-height of its own (the
        // surrounding <aside>/<Sheet> already provides those), and no
        // second internal scroll region (listClassName="") — this `nav`
        // is already `overflow-y-auto` and 10 rows is short enough that
        // one shared scroll for the whole sidebar/drawer reads better
        // than a nested one just for the list.
        className="h-auto w-full flex-none border-e-0 p-0"
        listClassName=""
      />

      <div className="flex flex-col gap-6 border-t border-sidebar-border pt-4">
        {groups.map((group) => (
          <NavGroup key={group.id} group={group} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

interface AppSidebarProps {
  role: string | null;
  activeConversationId: string | undefined;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  className?: string | undefined;
}

/**
 * Desktop sidebar. Plain markup with no Radix inside, so hiding it below
 * `md` with CSS is safe under Rule 3 (only context-dependent Radix
 * primitives must be conditionally rendered).
 *
 * Phase 4d Patch v2: now renders on EVERY `(app)`/`(admin)` route, not
 * just the two chat pages — `AppShell` (its only caller) derives
 * `activeConversationId`/`onSelectConversation`/`onNewChat` once, at the
 * shell level, from the current pathname + router, and passes the same
 * three props to `MobileDrawer` below so both surfaces stay identical.
 */
export function AppSidebar({
  role,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  className,
}: AppSidebarProps) {
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
      <SidebarNav
        role={role}
        activeConversationId={activeConversationId}
        onSelectConversation={onSelectConversation}
        onNewChat={onNewChat}
      />
    </aside>
  );
}
