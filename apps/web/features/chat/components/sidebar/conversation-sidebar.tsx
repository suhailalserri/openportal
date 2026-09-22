"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations } from "../../hooks/use-conversations";
import { filterConversationsByQuery } from "../../lib/conversation-search";
import { groupConversationsByDate } from "../../lib/conversation-grouping";
import { ConversationSearch } from "./conversation-search";
import { ConversationRow } from "./conversation-row";

export interface ConversationSidebarProps {
  /** undefined on the empty `/chat` state — nothing is "active" yet. */
  activeConversationId: string | undefined;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  className?: string;
}

const GROUP_LABEL_KEY = {
  today: "today",
  yesterday: "yesterday",
  thisWeek: "thisWeek",
  older: "older",
} as const;

/**
 * apps/web/features/chat/components/sidebar/conversation-sidebar.tsx
 *
 * Phase 4d. Assembles `useConversations` (the cache-first data source)
 * with the pure `filterConversationsByQuery` / `groupConversationsByDate`
 * helpers and `ConversationRow` into the sidebar the plan describes:
 * new-chat button, search, a leading "Pinned" section, then Today /
 * Yesterday / This week / Older.
 *
 * SEARCH THEN GROUP, in that order: the query filters the WHOLE loaded
 * set first (pinned and unpinned alike — a pinned conversation that
 * doesn't match the query should disappear from the pinned section too,
 * not just the dated ones), and grouping only ever runs on what survived
 * the filter. Reversing the order (group first, then filter each group)
 * would produce the same visible rows but do strictly more work for no
 * behavioural difference — filtering once up front is both simpler and
 * cheaper.
 *
 * PINNED VS. DATE-GROUPED: `conversation-grouping.ts`'s own header
 * comment names this component as the place that owns "pinned is a
 * separate leading section" — done here by partitioning the filtered
 * list before calling `groupConversationsByDate` on only the
 * NON-pinned remainder, so a pinned conversation never also appears a
 * second time in its date bucket.
 */
export function ConversationSidebar({
  activeConversationId,
  onSelect,
  onNewChat,
  className,
}: ConversationSidebarProps) {
  const t = useTranslations("chat");
  const { conversations, isLoading, togglePin, rename, remove } = useConversations();
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () => filterConversationsByQuery(conversations, query),
    [conversations, query],
  );
  const pinned = React.useMemo(() => filtered.filter((c) => c.isPinned), [filtered]);
  const groups = React.useMemo(
    () => groupConversationsByDate(filtered.filter((c) => !c.isPinned)),
    [filtered],
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

      <div className="min-h-0 flex-1 overflow-y-auto">
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
          </>
        )}
      </div>
    </div>
  );
}
