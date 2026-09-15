"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// EDGE CASE 4 (Phase 14.1): same conversation open in 2+ browser tabs.
// We don't try to merge/lock state across tabs — just warn, since the
// backend has no notion of "who owns" a conversation. Each tab announces
// its presence over a per-conversation BroadcastChannel; if we hear from
// a tabId that isn't our own within the last few seconds, we know another
// tab is active on the same conversation right now.

const TAB_ID = typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const PING_INTERVAL_MS   = 2_000;
const STALE_AFTER_MS     = 5_000;

type ChannelMessage = { type: "ping" | "sending"; tabId: string };

export function useTabConflict(conversationId: string | null) {
  const [otherTabOpen, setOtherTabOpen] = useState(false);
  const [otherTabSending, setOtherTabSending] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  const sendingUntilRef = useRef(0);

  useEffect(() => {
    setOtherTabOpen(false);
    setOtherTabSending(false);
    if (!conversationId || typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(`conv-tabs-${conversationId}`);
    channelRef.current = channel;
    lastSeenRef.current = new Map();

    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const { type, tabId } = event.data ?? {};
      if (!tabId || tabId === TAB_ID) return;
      lastSeenRef.current.set(tabId, Date.now());
      setOtherTabOpen(true);
      if (type === "sending") {
        sendingUntilRef.current = Date.now() + STALE_AFTER_MS;
        setOtherTabSending(true);
      }
    };

    const announce = () => channel.postMessage({ type: "ping", tabId: TAB_ID } satisfies ChannelMessage);
    announce();
    const pingId = setInterval(announce, PING_INTERVAL_MS);

    const pruneId = setInterval(() => {
      const now = Date.now();
      for (const [id, ts] of lastSeenRef.current) {
        if (now - ts > STALE_AFTER_MS) lastSeenRef.current.delete(id);
      }
      setOtherTabOpen(lastSeenRef.current.size > 0);
      if (sendingUntilRef.current && now > sendingUntilRef.current) {
        sendingUntilRef.current = 0;
        setOtherTabSending(false);
      }
    }, PING_INTERVAL_MS);

    return () => {
      clearInterval(pingId);
      clearInterval(pruneId);
      channel.close();
      channelRef.current = null;
    };
  }, [conversationId]);

  const announceSending = useCallback(() => {
    channelRef.current?.postMessage({ type: "sending", tabId: TAB_ID } satisfies ChannelMessage);
  }, []);

  return { otherTabOpen, otherTabSending, announceSending };
}
