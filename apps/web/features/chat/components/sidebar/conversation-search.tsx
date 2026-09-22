"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface ConversationSearchProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * apps/web/features/chat/components/sidebar/conversation-search.tsx
 *
 * Phase 4d. A thin, controlled wrapper around `components/ui/input` —
 * kept as its own file (rather than inlined in conversation-sidebar.tsx)
 * only because the phase summary named it as a separate piece; there is
 * no logic here beyond the icon placement, the actual filtering is
 * `lib/conversation-search.ts`'s `filterConversationsByQuery`, called by
 * the parent sidebar component so this one stays a pure controlled
 * input with no knowledge of the conversation list at all.
 *
 * Icon uses `ps-9` (padding-INLINE-START), not `pl-9` — Rule 2's
 * logical-property requirement: the search icon must sit at the
 * text-start edge (right side in `dir="rtl"`), not always the physical
 * left.
 */
export function ConversationSearch({ value, onChange, className }: ConversationSearchProps) {
  const t = useTranslations("chat");
  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("searchConversations")}
        aria-label={t("searchConversations")}
        className="ps-9"
      />
    </div>
  );
}
