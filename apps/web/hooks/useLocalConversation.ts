"use client";
import { useState, useEffect, useCallback } from "react";

// Simple key-value storage using IndexedDB via localStorage fallback
function storageKey(conversationId: string) {
  return `conv_${conversationId}`;
}

interface StoredMessage {
  id:        string;
  role:      "user" | "assistant";
  content:   string;
  createdAt: string;
}

export function useLocalConversation(conversationId: string | null) {
  const [messages,  setMessages]  = useState<StoredMessage[]>([]);
  const [hydrated,  setHydrated]  = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (!conversationId) { setHydrated(true); return; }
    try {
      const raw = localStorage.getItem(storageKey(conversationId));
      if (raw) setMessages(JSON.parse(raw) as StoredMessage[]);
    } catch { /* ignore */ }
    setHydrated(true);
  }, [conversationId]);

  const persist = useCallback((msgs: StoredMessage[]) => {
    if (!conversationId) return;
    try {
      localStorage.setItem(storageKey(conversationId), JSON.stringify(msgs));
    } catch { /* storage full — ignore */ }
  }, [conversationId]);

  const appendMessage = useCallback((msg: StoredMessage) => {
    setMessages(prev => {
      const updated = [...prev, msg];
      persist(updated);
      return updated;
    });
  }, [persist]);

  const clearLocal = useCallback(() => {
    if (!conversationId) return;
    localStorage.removeItem(storageKey(conversationId));
    setMessages([]);
  }, [conversationId]);

  return { messages, appendMessage, clearLocal, hydrated };
}
