"use client";
import { useState, useEffect } from "react";
import { formatRelativeDate }  from "@/lib/utils";

interface ConversationSummary {
  id:        string;
  title:     string | null;
  modelId:   string | null;
  isPinned:  boolean;
  updatedAt: string;
  group:     "today" | "yesterday" | "thisWeek" | "older";
}

function getGroup(dateStr: string): ConversationSummary["group"] {
  const now   = new Date();
  const d     = new Date(dateStr);
  const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 24)  return "today";
  if (diffH < 48)  return "yesterday";
  if (diffH < 168) return "thisWeek";
  return "older";
}

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch("/api/conversations");
        if (!res.ok) return;
        const data = await res.json() as { items: ConversationSummary[] };
        setConversations(
          (data.items ?? []).map(c => ({ ...c, group: getGroup(c.updatedAt) }))
        );
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const grouped = {
    pinned:    conversations.filter(c => c.isPinned),
    today:     conversations.filter(c => !c.isPinned && c.group === "today"),
    yesterday: conversations.filter(c => !c.isPinned && c.group === "yesterday"),
    thisWeek:  conversations.filter(c => !c.isPinned && c.group === "thisWeek"),
    older:     conversations.filter(c => !c.isPinned && c.group === "older"),
  };

  return { conversations, grouped, loading };
}
