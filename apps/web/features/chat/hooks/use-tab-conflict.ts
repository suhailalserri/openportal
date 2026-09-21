"use client";

import * as React from "react";

/**
 * apps/web/features/chat/hooks/use-tab-conflict.ts
 *
 * Phase 4b. `BroadcastChannel`, scoped per conversation id, so opening
 * the SAME conversation in two tabs can warn the person instead of
 * silently letting both send into it. Not cross-conversation, not
 * cross-user (a `BroadcastChannel` never crosses browser profiles or
 * origins) — purely "is another tab of mine looking at this exact
 * conversation right now, and is it currently sending".
 *
 * Deliberately NOT reconciling the two tabs' message lists — that would
 * need shared state (4d's IndexedDB cache, or a refetch), out of scope
 * here. This hook only answers the boolean question a banner needs;
 * `TabConflictBanner` is intentionally advisory, not a lock.
 *
 * No test file — same `environment: "node"`/no-`BroadcastChannel`
 * constraint as use-online-status.ts's own header comment.
 */
export interface TabConflictState {
  otherTabOpen: boolean;
  otherTabSending: boolean;
}

interface ConflictMessage {
  tabId: string;
  sending: boolean;
}

const CHANNEL_PREFIX = "op.chat.tab-conflict.";

function makeTabId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useTabConflict(
  conversationId: string | null | undefined,
  isSending: boolean,
): TabConflictState {
  const [state, setState] = React.useState<TabConflictState>({
    otherTabOpen: false,
    otherTabSending: false,
  });
  const channelRef = React.useRef<BroadcastChannel | null>(null);
  const tabIdRef = React.useRef<string>(makeTabId());

  React.useEffect(() => {
    setState({ otherTabOpen: false, otherTabSending: false });
    if (!conversationId || typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${conversationId}`);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<ConflictMessage>) => {
      const data = event.data;
      if (!data || data.tabId === tabIdRef.current) return;
      setState({ otherTabOpen: true, otherTabSending: data.sending });
    };

    // Announce this tab's presence so an already-open tab learns about
    // it immediately, rather than waiting for this tab's next send.
    channel.postMessage({ tabId: tabIdRef.current, sending: isSending } satisfies ConflictMessage);

    return () => {
      channel.close();
      channelRef.current = null;
    };
    // isSending intentionally excluded — re-subscribing per keystroke-
    // adjacent status change would spam every other tab; the effect
    // below re-announces on change instead of re-creating the channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  React.useEffect(() => {
    channelRef.current?.postMessage({ tabId: tabIdRef.current, sending: isSending } satisfies ConflictMessage);
  }, [isSending]);

  return state;
}
