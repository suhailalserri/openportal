"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations } from "../../hooks/use-conversations";
import { filterConversationsByQuery } from "../../lib/conversation-search";
import { groupConversationsByDate, type ConversationGroup } from "../../lib/conversation-grouping";
import type { ConversationSummary } from "../../types";
import { ConversationSearch } from "./conversation-search";
import { ConversationRow } from "./conversation-row";

export interface ConversationSidebarProps {
  /** undefined on the empty `/chat` state — nothing is "active" yet. */
  activeConversationId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  /** Phase 4d Patch v2. When set, shows at most this many conversations
   *  total (pinned first, then the date groups in order), and appends a
   *  "View all chats →" link to `/chat/all` once the real count exceeds
   *  it. Omit for the unbounded, standalone list (`/chat/all` itself
   *  uses `ConversationFullList` instead, which never caps). */
  limit?: number;
  className?: string;
  /** Classes for the scrollable list wrapper. Standalone usage wants its
   *  own bounded `overflow-y-auto` region (the default below); embedded
   *  inside AppSidebar/MobileDrawer's own already-scrollable `<nav>`
   *  (Phase 4d Patch v2), a capped 10-row list should just grow to its
   *  natural height and let the ambient container scroll — nesting a
   *  second scroll region inside the first is worse UX for a list this
   *  short. Pass `""` to opt out of the internal scroll entirely. */
  listClassName?: string;
}

const GROUP_LABEL_KEY = {
  today: "today",
  yesterday: "yesterday",
  thisWeek: "thisWeek",
  older: "older",
} as const;

/** Caps `pinned` + `groups` (already filtered/grouped, in display order)
 *  to `limit` total rows, keeping each section's own internal order and
 *  dropping now-empty groups entirely. `limit === undefined` returns the
 *  input untouched. Kept as a pure function (no hook, no component
 *  state) so the "which rows survive the cap" decision is unit-testable
 *  on its own, same reasoning as `groupConversationsByDate` itself. */
function applyLimit(
  pinned: ConversationSummary[],
  groups: ConversationGroup[],
  limit: number | undefined,
): { pinned: ConversationSummary[]; groups: ConversationGroup[]; hasMore: boolean } {
  if (limit === undefined) return { pinned, groups, hasMore: false };

  let remaining = limit;
  const limitedPinned = pinned.slice(0, remaining);
  remaining -= limitedPinned.length;

  const limitedGroups: ConversationGroup[] = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const conversations = group.conversations.slice(0, remaining);
    if (conversations.length > 0) {
      limitedGroups.push({ ...group, conversations });
      remaining -= conversations.length;
    }
  }

  const totalAvailable = pinned.length + groups.reduce((sum, g) => sum + g.conversations.length, 0);
  const totalShown = limitedPinned.length + limitedGroups.reduce((sum, g) => sum + g.conversations.length, 0);

  return { pinned: limitedPinned, groups: limitedGroups, hasMore: totalAvailable > totalShown };
}

/**
 * apps/web/features/chat/components/sidebar/conversation-sidebar.tsx
 *
 * Phase 4d, patched in Phase 4d Patch v2 to add the `limit` prop. As of
 * the patch this is no longer rendered by the two chat pages directly
 * (see their own header comments) — it now lives exclusively inside
 * `components/layout/app-sidebar.tsx`'s `SidebarNav`, shared by the
 * desktop sidebar and the mobile drawer, always called with
 * `limit={CONVERSATION_LIST_LIMIT}` (10) so both surfaces show the same
 * capped list plus a "View all chats →" link to the uncapped
 * `/chat/all` page (`ConversationFullList`, a sibling component that
 * reuses the same search/group/row pieces below).
 *
 * SEARCH THEN GROUP, THEN LIMIT, in that order: the query filters the
 * WHOLE loaded set first (pinned and unpinned alike), grouping runs only
 * on what survived the filter, and the cap is applied last so a search
 * result is never silently cut off by a stale limit computed before the
 * user typed anything.
 *
 * PINNED VS. DATE-GROUPED: pinned conversations are partitioned out
 * before grouping, so a pinned conversation never also appears a second
 * time in its date bucket, and — post-patch — always counts toward the
 * cap FIRST (a pinned chat should never be pushed out of the visible 10
 * by an unpinned one).
 */
export function ConversationSidebar({
  activeConversationId,
  onSelect,
  onNewChat,
  limit,
  className,
  listClassName = "min-h-0 flex-1 overflow-y-auto",
}: ConversationSidebarProps) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const { conversations, isLoading, togglePin, rename, remove } = useConversations();
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () => filterConversationsByQuery(conversations, query),
    [conversations, query],
  );
  const allPinned = React.useMemo(() => filtered.filter((c) => c.isPinned), [filtered]);
  const allGroups = React.useMemo(
    () => groupConversationsByDate(filtered.filter((c) => !c.isPinned)),
    [filtered],
  );
  const { pinned, groups, hasMore } = React.useMemo(
    () => applyLimit(allPinned, allGroups, limit),
    [allPinned, allGroups, limit],
  );

  const isEmpty = !isLoading && conversations.length === 0;
  const noSearchResults = !isLoading && conversations.length > 0 && filtered.length === 0;

  return (
    <div className={cn("flex h-full min-h-0 w-72 shrink-0 flex-col gap-3 border-e border-border p-3", className)}>
      <Button type="button" onClick={onNewChat} className="w-full justify-start gap-2">
        <Plus aria-hidden="true" className="size-4" />
        {t("newChat")}
      </Button>

      <ConversationSearch value={query} onChange={setQuery} />

      <div className={cn(listClassName)}>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="px-2 py-4 text-center text-[13px] text-muted-foreground">
            {t("noConversations")}
          </p>
        ) : noSearchResults ? (
          <p className="px-2 py-4 text-center text-[13px] text-muted-foreground">
            {t("noConversations")}
          </p>
        ) : (
          <>
            {pinned.length > 0 && (
              <section className="mb-2">
                <h3 className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {t("pinned")}
                </h3>
                {pinned.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    isActive={c.id === activeConversationId}
                    onSelect={onSelect}
                    onTogglePin={togglePin}
                    onRename={rename}
                    onDelete={remove}
                  />
                ))}
              </section>
            )}

            {groups.map((group) => (
              <section key={group.key} className="mb-2">
                <h3 className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {t(GROUP_LABEL_KEY[group.key])}
                </h3>
                {group.conversations.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    isActive={c.id === activeConversationId}
                    onSelect={onSelect}
                    onTogglePin={togglePin}
                    onRename={rename}
                    onDelete={remove}
                  />
                ))}
              </section>
            ))}

            {hasMore && (
              <Link
                href={`/${locale}/chat/all`}
                className="flex items-center justify-between rounded-md px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                {t("viewAllChats")}
                <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
