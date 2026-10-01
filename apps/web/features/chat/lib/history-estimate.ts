import type { ChatMessage } from "../types";

/**
 * apps/web/features/chat/lib/history-estimate.ts
 *
 * P6.3f (session 54). The composer's token and cost estimates read the conversation as
 * `{ content }[]`. chat-view used to rebuild that array on every render, so the composer's
 * `useMemo([selected, history, value])` never hit and every keystroke and every streamed frame
 * re-walked the whole chat. This keeps ONE array per `messages` list, and while a reply is in
 * flight (`frozen`) keeps the previous one: the estimate is advisory, and the final text is
 * picked up the moment the turn ends and `frozen` goes back to false.
 */
export interface HistoryEntry {
  content: string;
}

export interface HistoryCache {
  source: readonly ChatMessage[];
  value: HistoryEntry[];
}

export function nextHistory(
  messages: readonly ChatMessage[],
  prev: HistoryCache | null,
  frozen: boolean,
): HistoryCache {
  if (prev !== null && (frozen || prev.source === messages)) return prev;
  return { source: messages, value: messages.map((m) => ({ content: m.content })) };
}
