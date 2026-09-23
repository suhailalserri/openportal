import { describe, it, expect } from "vitest";

import { periodToRange, isDashboardPeriod, DASHBOARD_PERIODS } from "./period-range";

describe("periodToRange", () => {
  // Fixed "now" so the test never depends on the runner's clock/timezone.
  const now = new Date("2026-09-23T00:05:00.000Z");

  it("7-day window spans exactly 7 calendar days ending today, inclusive", () => {
    const { from, to } = periodToRange(7, now);
    const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    // 6 full days between the two boundaries + the fractional last day = ~7d.
    expect(days).toBe(6);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
  });

  it("30-day and 90-day windows scale the same way", () => {
    const r30 = periodToRange(30, now);
    const r90 = periodToRange(90, now);
    expect(Math.round((r30.to.getTime() - r30.from.getTime()) / 86_400_000)).toBe(29);
    expect(Math.round((r90.to.getTime() - r90.from.getTime()) / 86_400_000)).toBe(89);
  });

  it("`to` always includes all of 'today', even called just after midnight", () => {
    const justAfterMidnight = new Date("2026-09-23T00:00:01.000Z");
    const { to } = periodToRange(7, justAfterMidnight);
    expect(to.getDate()).toBe(justAfterMidnight.getDate());
    expect(to.getHours()).toBe(23);
  });

  it("does not mutate the `now` argument", () => {
    const before = now.getTime();
    periodToRange(30, now);
    expect(now.getTime()).toBe(before);
  });
});

describe("isDashboardPeriod", () => {
  it("accepts only 7, 30, 90", () => {
    for (const p of DASHBOARD_PERIODS) expect(isDashboardPeriod(p)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of [0, 1, 14, 60, 91, 365, -7]) {
      expect(isDashboardPeriod(bad)).toBe(false);
    }
  });
});
