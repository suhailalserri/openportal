"use client";

import * as React from "react";
import { Plus, Search, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Ported from `.sidebar` / `.sidebar-head` / `.new-chat-btn` / `.search-box`
 * / `.group-label` / `.conv-item` / `.conv-del` / `.sidebar-empty` /
 * `.sidebar-foot` / `.user-dot` / `.credit-pill` in the theme HTML.
 *
 * Distinct from `components/layout/app-sidebar.tsx` (the nav shell built
 * in Session 2.1) — this is the chat-only conversation list, not the app
 * navigation. Different directory, different name, no shared import.
 *
 * Presentational only: search/select/delete are plain callbacks, no
 * IndexedDB cache or tRPC query wired in (that's `useLocalConversation` /
 * the real conversations router, per the master plan's Phase 14 / 17).
 * `credits` is a pre-formatted string — callers pass the output of
 * lib/format.ts's `formatCredits`, this component does not format money
 * itself (Rule 1: one conversion point).
 */
export interface ChatSidebarConversation {
  id: string;
  title: string;
  isActive?: boolean;
}

export interface ChatSidebarProps {
  conversations: ChatSidebarConversation[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  userName: string;
  userInitial?: string;
  planLabel?: string;
  /** Pre-formatted, e.g. via formatCredits — see file header note. */
  creditsLabel?: string;
  emptyLabel?: string;
  className?: string;
}

export function ChatSidebar({
  conversations,
  searchQuery,
  onSearchChange,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  userName,
  userInitial,
  planLabel,
  creditsLabel,
  emptyLabel = "لا توجد محادثات",
  className,
}: ChatSidebarProps) {
  const initial = userInitial ?? userName.slice(0, 1).toUpperCase();

  return (
    <aside className={cn("flex min-h-[420px] flex-col bg-secondary", className)}>
      <div className="flex items-center gap-2.5 px-3.5 pt-4 pb-3">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          className="text-accent-foreground"
          aria-hidden="true"
        >
          <path d="M5 20V7M19 20V7M4 7C7 4 17 4 20 7" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="text-[17px] font-semibold text-accent-foreground">OpenPortal</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-3.5">
        <button
          type="button"
          onClick={onNewChat}
          className="mx-1 mb-3 flex w-[calc(100%-8px)] items-center justify-center gap-[7px] rounded-[11px] border border-primary px-3 py-2.5 text-[13.5px] font-medium text-accent-foreground transition-colors hover:bg-accent"
        >
          <Plus className="size-[15px]" />
          <span>محادثة جديدة</span>
        </button>

        <div className="relative mx-1 mb-1.5">
          <Search className="pointer-events-none absolute start-[11px] top-1/2 size-3.5 -translate-y-1/2 text-faint-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ابحث في المحادثات"
            className="rounded-[10px] py-[9px] ps-[33px] text-[13px]"
          />
        </div>

        {conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-faint-foreground">{emptyLabel}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <div
                  className={cn(
                    "group flex w-full items-center gap-1.5 rounded-[9px] px-2.5 py-[9px] text-[13.5px] text-muted-foreground transition-colors hover:bg-border hover:text-foreground",
                    conv.isActive && "bg-accent text-foreground"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    className="min-w-0 flex-1 truncate text-start"
                  >
                    {conv.title}
                  </button>
                  <button
                    type="button"
                    aria-label="حذف المحادثة"
                    onClick={() => onDeleteConversation(conv.id)}
                    className="rounded-[5px] p-0.5 text-faint-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-border px-3.5 py-3">
        <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-accent text-[12.5px] font-bold text-accent-foreground">
          {initial}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <b className="block truncate text-[13px] font-semibold text-foreground">{userName}</b>
          {planLabel && <span className="text-[11.5px] text-faint-foreground">{planLabel}</span>}
        </div>
        {creditsLabel && (
          <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[11.5px] font-semibold text-success">
            {creditsLabel}
          </span>
        )}
      </div>
    </aside>
  );
}
