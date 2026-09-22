/**
 * apps/web/features/chat/lib/conversation-grouping.ts
 *
 * Phase 4d. Buckets the sidebar's conversation list into Today /
 * Yesterday / This week / Older, driving the `chat.today` / `chat.
 * yesterday` / `chat.thisWeek` / `chat.older` labels already scaffolded
 * in messages/{ar,en}.json.
 *
 * CALENDAR-DAY boundaries, not a rolling window: "Today" means "shares
 * the viewer's local calendar date with `now`", not "within the last 24
 * hours" — a conversation from 11:58pm yesterday and one from 12:02am
 * today are 4 minutes apart but must land in different buckets, and a
 * conversation from 9am nine days ago must not read as "Today" just
 * because `now` is also 9am. This is a deliberately different rule from
 * lib/format.ts's `formatRelativeDate` (a per-MESSAGE timestamp label,
 * "3h ago" / "yesterday", which IS a rolling window) — that function is
 * for one message's own metadata line, this one is for bucketing many
 * conversations into sidebar sections, and the two must not be conflated
 * or a conversation could visually sit under "Today" while its own last-
 * message label says "yesterday".
 *
 * TIME ZONE: everything here uses the browser's LOCAL calendar day
 * (`getFullYear`/`getMonth`/`getDate`, not UTC) — a person in Riyadh at
 * 1am local time (still "today" for them) must not see last night's chat
 * fall into "Yesterday" because the stored `updatedAt` crossed a UTC day
 * boundary a few hours earlier. This makes the boundary DST-neutral by
 * construction: local calendar-day comparison never has to reason about
 * a clock changing mid-comparison, unlike an elapsed-hours calculation
 * would.
 *
 * "This week" is a plain 7-calendar-day trailing window from `now`
 * (day 2 through day 6 inclusive; day 0 is Today, day 1 is Yesterday,
 * day 7+ is Older) — NOT an ISO calendar week (Mon–Sun) or a
 * locale-dependent week start (which would differ between ar/en and add
 * a second axis of boundary bugs for no product benefit here).
 */
import type { ConversationSummary } from "../types";

export type ConversationGroupKey = "today" | "yesterday" | "thisWeek" | "older";

export interface ConversationGroup {
  key: ConversationGroupKey;
  conversations: ConversationSummary[];
}

const GROUP_ORDER: readonly ConversationGroupKey[] = ["today", "yesterday", "thisWeek", "older"];

/** Local calendar-day difference: `date`'s day minus `reference`'s day,
 *  in whole days, ignoring time-of-day entirely. Positive = `date` is
 *  in the past relative to `reference`. */
function calendarDayDiff(reference: Date, date: Date): number {
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // 86_400_000 = ms per day. A plain subtraction after zeroing time-of-day
  // is safe here specifically BECAUSE both sides are local midnights on
  // the same clock — a DST transition between the two dates shifts the
  // wall-clock offset, not which calendar day either midnight falls on,
  // so the day COUNT this produces is still correct even though the
  // millisecond difference across the transition is not exactly 24h.
  return Math.round((ref.getTime() - d.getTime()) / 86_400_000);
}

export function groupKeyForDate(date: Date | string, now: Date = new Date()): ConversationGroupKey {
  const d = new Date(date);
  const diff = calendarDayDiff(now, d);
  if (diff <= 0) return "today"; // 0 = today; negative (a clock-skewed future timestamp) also renders as Today rather than crashing the grouping
  if (diff === 1) return "yesterday";
  if (diff <= 6) return "thisWeek";
  return "older";
}

/**
 * Groups conversations already sorted newest-first (the server's
 * `GET /api/conversations` returns `orderBy: [desc(updatedAt)]`) into
 * ordered, non-empty sections. Pinned conversations are NOT filtered out
 * here — pinning is a separate, orthogonal concern the sidebar component
 * renders as its own leading section by reading `isPinned` itself; this
 * function only buckets by date so a pinned conversation still has a
 * correct date-group identity if the caller wants it.
 */
export function groupConversationsByDate(
  conversations: readonly ConversationSummary[],
  now: Date = new Date(),
): ConversationGroup[] {
  const buckets = new Map<ConversationGroupKey, ConversationSummary[]>();
  for (const conv of conversations) {
    const key = groupKeyForDate(conv.updatedAt, now);
    const list = buckets.get(key);
    if (list) list.push(conv);
    else buckets.set(key, [conv]);
  }
  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    conversations: buckets.get(key)!,
  }));
}
