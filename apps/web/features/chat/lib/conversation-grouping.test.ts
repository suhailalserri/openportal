import { describe, it, expect } from "vitest";

import { groupKeyForDate, groupConversationsByDate } from "./conversation-grouping";
import type { ConversationSummary } from "../types";

function conv(id: string, updatedAt: string, isPinned = false): ConversationSummary {
  return { id, title: `Conversation ${id}`, modelId: "gpt-4o", isPinned, updatedAt };
}

describe("groupKeyForDate", () => {
  // A fixed "now" for every case: 2026-09-22T10:00:00 local time.
  const now = new Date(2026, 8, 22, 10, 0, 0);

  it("same calendar day, any time of day, is today", () => {
    expect(groupKeyForDate(new Date(2026, 8, 22, 0, 0, 1), now)).toBe("today");
    expect(groupKeyForDate(new Date(2026, 8, 22, 23, 59, 59), now)).toBe("today");
    expect(groupKeyForDate(new Date(2026, 8, 22, 10, 0, 0), now)).toBe("today");
  });

  it("exactly midnight boundary: 11:58pm yesterday vs 12:02am today land in different buckets", () => {
    const nearMidnight = new Date(2026, 8, 22, 0, 2, 0); // today, just after midnight
    const lateLastNight = new Date(2026, 8, 21, 23, 58, 0); // yesterday, just before midnight
    expect(groupKeyForDate(nearMidnight, now)).toBe("today");
    expect(groupKeyForDate(lateLastNight, now)).toBe("yesterday");
  });

  it("yesterday at any time of day is yesterday, not today (not a rolling 24h window)", () => {
    // 9am "now" vs a 9am-yesterday timestamp is exactly 24h — must still
    // be "yesterday", proving this is calendar-day bucketing, not hours-elapsed.
    const nowAt9 = new Date(2026, 8, 22, 9, 0, 0);
    const yesterdayAt9 = new Date(2026, 8, 21, 9, 0, 0);
    expect(groupKeyForDate(yesterdayAt9, nowAt9)).toBe("yesterday");
  });

  it("this week: day 2 through day 6 inclusive", () => {
    expect(groupKeyForDate(new Date(2026, 8, 20, 12, 0, 0), now)).toBe("thisWeek"); // 2 days ago
    expect(groupKeyForDate(new Date(2026, 8, 16, 12, 0, 0), now)).toBe("thisWeek"); // 6 days ago
  });

  it("week boundary: exactly 7 days ago is older, not thisWeek", () => {
    expect(groupKeyForDate(new Date(2026, 8, 15, 10, 0, 0), now)).toBe("older"); // 7 days ago
    expect(groupKeyForDate(new Date(2026, 7, 1, 10, 0, 0), now)).toBe("older");
  });

  it("a clock-skewed future timestamp renders as today rather than a negative bucket", () => {
    const tomorrow = new Date(2026, 8, 23, 10, 0, 0);
    expect(groupKeyForDate(tomorrow, now)).toBe("today");
  });

  it("accepts an ISO string the same as a Date", () => {
    expect(groupKeyForDate("2026-09-22T10:00:00", now)).toBe("today");
  });

  it("month/year boundary: Sep 22 vs Aug 27 is more than 6 days, so older", () => {
    expect(groupKeyForDate(new Date(2026, 7, 27, 10, 0, 0), now)).toBe("older");
  });
});

describe("groupConversationsByDate", () => {
  const now = new Date(2026, 8, 22, 10, 0, 0);

  it("buckets and orders sections today → yesterday → thisWeek → older, omitting empty sections", () => {
    const list = [
      conv("a", new Date(2026, 8, 22, 9, 0, 0).toISOString()), // today
      conv("b", new Date(2026, 7, 1, 9, 0, 0).toISOString()), // older
    ];
    const groups = groupConversationsByDate(list, now);
    expect(groups.map((g) => g.key)).toEqual(["today", "older"]);
    expect(groups[0]?.conversations.map((c) => c.id)).toEqual(["a"]);
    expect(groups[1]?.conversations.map((c) => c.id)).toEqual(["b"]);
  });

  it("preserves the input's relative order within a bucket (already newest-first from the server)", () => {
    const list = [
      conv("a", new Date(2026, 8, 22, 15, 0, 0).toISOString()),
      conv("b", new Date(2026, 8, 22, 9, 0, 0).toISOString()),
      conv("c", new Date(2026, 8, 22, 3, 0, 0).toISOString()),
    ];
    const groups = groupConversationsByDate(list, now);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.conversations.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("an empty list produces no groups", () => {
    expect(groupConversationsByDate([], now)).toEqual([]);
  });

  it("all four buckets can be present simultaneously, in order", () => {
    const list = [
      conv("today", new Date(2026, 8, 22, 9, 0, 0).toISOString()),
      conv("yesterday", new Date(2026, 8, 21, 9, 0, 0).toISOString()),
      conv("week", new Date(2026, 8, 18, 9, 0, 0).toISOString()),
      conv("old", new Date(2026, 7, 1, 9, 0, 0).toISOString()),
    ];
    const groups = groupConversationsByDate(list, now);
    expect(groups.map((g) => g.key)).toEqual(["today", "yesterday", "thisWeek", "older"]);
  });
});
