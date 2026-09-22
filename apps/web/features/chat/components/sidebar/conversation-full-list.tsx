"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations } from "../../hooks/use-conversations";
import { filterConversationsByQuery } from "../../lib/conversation-search";
import { groupConversationsByDate } from "../../lib/conversation-grouping";
import { ConversationSearch } from "./conversation-search";
import { ConversationRow } from "./conversation-row";

export interface ConversationFullListProps {
  activeConversationId: string | undefined;
  onSelect: (id: string) => void;
  className?: string;
}

const GROUP_LABEL_KEY = {
  today: "today",
  yesterday: "yesterday",
  thisWeek: "thisWeek",
  older: "older",
} as const;

/**
 * apps/web/features/chat/components/sidebar/conversation-full-list.tsx
 *
 * Phase 4d Patch v2. The list body behind `/chat/all` — every
 * conversation, search, pinned-first-then-dated grouping, no cap, no
 * "View all chats" link (this IS all chats). Deliberately a sibling of
 * `conversation-sidebar.tsx` rather than that component reused with an
 * unset `limit`: this one has no New Chat button (the page's own
 * floating action button owns that here) and no embedding assumptions
 * about a fixed-width bordered parent — it fills whatever width/height
 * the `/chat/all` page gives it. Both components share the same
 * search/group/row pieces (`filterConversationsByQuery`,
 * `groupConversationsByDate`, `ConversationRow`) so matching, grouping,
 * and row-rendering behaviour can never drift between the
 * sidebar/drawer's capped view and this uncapped page.
 */
export function ConversationFullList({ activeConversationId, onSelect, className }: ConversationFullListProps) {
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
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <ConversationSearch value={query} onChange={setQuery} className="max-w-md" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">{t("noConversations")}</p>
        ) : noSearchResults ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">{t("noConversations")}</p>
        ) : (
          <>
            {pinned.length > 0 && (
              <section className="mb-3">
                <h3 className="px-2 py-1 text-[11px] font-medium text-muted-foreground">{t("pinned")}</h3>
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
              <section key={group.key} className="mb-3">
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
