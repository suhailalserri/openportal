"use client";
import { useState, useEffect, useCallback } from "react";

export interface ConversationSummary {
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

// Backs the sidebar's per-conversation actions menu. Rename/pin/delete all
// call the existing /api/conversations/[id] PATCH+DELETE routes — those
// endpoints already existed and were fully functional, the sidebar UI just
// never called them. No new backend surface here, only wiring.
export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/conversations");
      if (!res.ok) { setError(true); return; }
      const data = await res.json() as { items: ConversationSummary[] };
      setError(false);
      setConversations(
        (data.items ?? []).map(c => ({ ...c, group: getGroup(c.updatedAt) }))
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rename = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return false;
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, title: trimmed } : c)));
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error("rename failed");
      return true;
    } catch {
      await load();
      return false;
    }
  }, [load]);

  const togglePin = useCallback(async (id: string, isPinned: boolean) => {
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, isPinned } : c)));
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isPinned }),
      });
      if (!res.ok) throw new Error("pin toggle failed");
      return true;
    } catch {
      await load();
      return false;
    }
  }, [load]);

  const remove = useCallback(async (id: string) => {
    let prevState: ConversationSummary[] = [];
    setConversations(prev => { prevState = prev; return prev.filter(c => c.id !== id); });
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      return true;
    } catch {
      setConversations(prevState);
      return false;
    }
  }, []);

  const grouped = {
    pinned:    conversations.filter(c => c.isPinned),
    today:     conversations.filter(c => !c.isPinned && c.group === "today"),
    yesterday: conversations.filter(c => !c.isPinned && c.group === "yesterday"),
    thisWeek:  conversations.filter(c => !c.isPinned && c.group === "thisWeek"),
    older:     conversations.filter(c => !c.isPinned && c.group === "older"),
  };

  return { conversations, grouped, loading, error, refresh: load, rename, togglePin, remove };
}
