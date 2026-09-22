/**
 * apps/web/features/chat/lib/pending-first-message.ts
 *
 * Phase 4d. Solves a gap new-chat.ts's own header comment names but does
 * not itself close: the empty `/chat` page and an existing `/chat/[id]`
 * page are DIFFERENT Next.js route segments, so `router.push()` from one
 * to the other fully unmounts the first page's React tree — including
 * whatever `useChatStream` instance lives on it. use-chat-stream.ts
 * aborts its in-flight request on unmount (by design, for the ordinary
 * case of navigating away from a stream in progress — see that hook's
 * own comment). If `/chat`'s composer called `send()` and THEN navigated,
 * the navigation would abort the very request `send()` just started,
 * before a single chunk came back.
 *
 * So the two steps are split across the navigation instead of both
 * happening on the old page:
 *   1. `/chat`'s composer (chat-view.tsx, new-chat branch) generates the
 *      id, stashes the drafted text HERE keyed by that id, and navigates.
 *   2. `/chat/[id]`'s freshly-mounted ChatView checks for a pending
 *      message under its own id on mount; if present, it consumes
 *      (removes) it and calls its OWN `useChatStream.send()` — a request
 *      that starts after the final page has mounted has no unmount to
 *      race.
 *
 * A plain module-level `Map`, not sessionStorage/localStorage: this only
 * ever needs to survive a same-tab client-side navigation a few hundred
 * milliseconds long, never a reload — a hard refresh mid-navigation
 * losing an unsent draft is an acceptable, rare edge case (the person is
 * back at their empty composer, not looking at a silently-lost message),
 * and using Web Storage here would mean JSON-serializing content that
 * might contain characters needing no special handling at all in memory.
 * `take*` (not `read*`) deletes on read — a pending message must be
 * consumed exactly once; a remount from React StrictMode's dev
 * double-invoke or a later revisit to the same id must never re-send it.
 */

const pending = new Map<string, string>();

export function setPendingFirstMessage(conversationId: string, content: string): void {
  pending.set(conversationId, content);
}

/** Returns and removes the pending message for this id, or undefined. */
export function takePendingFirstMessage(conversationId: string): string | undefined {
  const value = pending.get(conversationId);
  pending.delete(conversationId);
  return value;
}
