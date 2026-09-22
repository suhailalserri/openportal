/**
 * apps/web/features/chat/lib/conversation-search.ts
 *
 * Phase 4d. The sidebar's "client-side search over the loaded 50"
 * (FRONTEND_REBUILD_PLAN.md §4d) — a pure filter so the matching rule
 * itself is unit-testable without mounting conversation-sidebar.tsx.
 *
 * MATCH RULE: case-insensitive substring match against `title` only.
 * `modelId` is intentionally NOT searched — it is an internal id
 * ("gpt-4o", not a display name) and matching against it would let a
 * query like "4o" surface unrelated conversations whose title never
 * mentions the model, which reads as a broken search rather than a
 * helpful one. A conversation with `title: null` (no title yet — B1's
 * auto-title job hasn't run, or it's brand new) never matches a
 * non-empty query, since there is nothing to compare against; it always
 * matches an empty query, same as every other row (see below).
 *
 * An empty/whitespace-only query returns the input UNFILTERED (not
 * empty) — the sidebar's default state, with no query typed yet, must
 * show every conversation, not none.
 */
import type { ConversationSummary } from "../types";

export function filterConversationsByQuery(
  conversations: readonly ConversationSummary[],
  query: string,
): ConversationSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...conversations];
  return conversations.filter((c) => (c.title ?? "").toLowerCase().includes(q));
}
