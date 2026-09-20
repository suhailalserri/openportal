import { describe, it, expect } from "vitest";

import {
  CALCULATOR_BUDGET_YER,
  MAX_DISPLAY_MESSAGES,
  REASSURING_MIN_REMAINING_PERCENT,
  isReassuring,
  MESSAGE_SIZES,
  bestValuePackageIndex,
  computeSizeResult,
  conservativeYerPerCredit,
  creditsForChat,
  creditsForTokens,
  isFreeModel,
  messagesForBudget,
  packageYerPerCredit,
} from "./pricing";

const MICRO = 1_000_000;

// 5,000 credits for 10,000 YER = 2 YER/credit; 2,000 credits for 5,000 YER = 2.5 YER/credit.
const PKGS = [
  { priceYer: 10_000, credits: 5_000 * MICRO },
  { priceYer: 5_000, credits: 2_000 * MICRO },
];

const MID = { creditsPerKInput: 3, creditsPerKOutput: 15 };
const FREE = { creditsPerKInput: 0, creditsPerKOutput: 0 };

describe("packageYerPerCredit", () => {
  it("divides YER by whole credits (not micro-credits)", () => {
    expect(packageYerPerCredit(PKGS[0]!, MICRO)).toBe(2);
    expect(packageYerPerCredit(PKGS[1]!, MICRO)).toBe(2.5);
  });
});

describe("conservativeYerPerCredit", () => {
  it("picks the LEAST favourable rate so the page under-promises", () => {
    expect(conservativeYerPerCredit(PKGS, MICRO)).toBe(2.5);
  });
  it("returns null with no packages", () => {
    expect(conservativeYerPerCredit([], MICRO)).toBeNull();
  });
  it("ignores unusable packages (zero credits / zero price / NaN)", () => {
    expect(conservativeYerPerCredit([{ priceYer: 100, credits: 0 }], MICRO)).toBeNull();
    expect(conservativeYerPerCredit([{ priceYer: 0, credits: 5 * MICRO }], MICRO)).toBeNull();
    expect(conservativeYerPerCredit([{ priceYer: Number.NaN, credits: MICRO }], MICRO)).toBeNull();
    expect(
      conservativeYerPerCredit([{ priceYer: 100, credits: 0 }, ...PKGS], MICRO),
    ).toBe(2.5);
  });
});

describe("bestValuePackageIndex", () => {
  it("returns the index of the strictly cheapest YER-per-credit", () => {
    expect(bestValuePackageIndex(PKGS, MICRO)).toBe(0);
  });
  it("returns -1 for a single package or a tie (no honest 'best')", () => {
    expect(bestValuePackageIndex([PKGS[0]!], MICRO)).toBe(-1);
    expect(bestValuePackageIndex([PKGS[0]!, PKGS[0]!], MICRO)).toBe(-1);
    expect(bestValuePackageIndex([], MICRO)).toBe(-1);
  });
  it("skips unusable packages instead of crowning them", () => {
    expect(bestValuePackageIndex([{ priceYer: 1, credits: 0 }, PKGS[1]!], MICRO)).toBe(-1);
  });
});

describe("isFreeModel", () => {
  it("is free only when BOTH sides are zero", () => {
    expect(isFreeModel(FREE)).toBe(true);
    expect(isFreeModel({ creditsPerKInput: 0, creditsPerKOutput: 1 })).toBe(false);
    expect(isFreeModel({ creditsPerKInput: 1, creditsPerKOutput: 0 })).toBe(false);
  });
});

describe("creditsForTokens", () => {
  it("prices each side per 1,000 tokens", () => {
    // 250 in * 3/K + 250 out * 15/K = 0.75 + 3.75
    expect(creditsForTokens(MID, 250, 250)).toBeCloseTo(4.5, 10);
    expect(creditsForTokens(MID, 0, 0)).toBe(0);
  });
});

describe("creditsForChat — history is re-sent every turn", () => {
  const size = { inputTokens: 250, outputTokens: 250 };

  it("one turn equals one message", () => {
    expect(creditsForChat(MID, size, 1)).toBeCloseTo(creditsForTokens(MID, 250, 250), 10);
  });
  it("zero, negative and NaN-ish turn counts cost nothing", () => {
    expect(creditsForChat(MID, size, 0)).toBe(0);
    expect(creditsForChat(MID, size, -3)).toBe(0);
  });
  it("floors fractional turns", () => {
    expect(creditsForChat(MID, size, 2.9)).toBe(creditsForChat(MID, size, 2));
  });
  it("matches a hand-rolled turn-by-turn simulation", () => {
    for (const turns of [1, 2, 5, 10, 25]) {
      let history = 0;
      let total = 0;
      for (let i = 1; i <= turns; i++) {
        // This turn reads all prior history + the new prompt, writes one reply.
        total += creditsForTokens(MID, history + size.inputTokens, size.outputTokens);
        history += size.inputTokens + size.outputTokens;
      }
      expect(creditsForChat(MID, size, turns)).toBeCloseTo(total, 8);
    }
  });
  it("costs MORE than N independent messages (the sceptic's test)", () => {
    const independent = 10 * creditsForTokens(MID, 250, 250);
    expect(creditsForChat(MID, size, 10)).toBeGreaterThan(independent);
  });
});

describe("messagesForBudget", () => {
  it("floors, never rounds up", () => {
    expect(messagesForBudget(1000, 3)).toBe(333);
    expect(messagesForBudget(1000, 2.5)).toBe(400);
  });
  it("returns null for a free (zero-price) message", () => {
    expect(messagesForBudget(1000, 0)).toBeNull();
    expect(messagesForBudget(1000, -1)).toBeNull();
    expect(messagesForBudget(1000, Number.NaN)).toBeNull();
  });
  it("caps absurdly high counts", () => {
    expect(messagesForBudget(1000, 1e-9)).toBe(MAX_DISPLAY_MESSAGES);
  });
  it("returns 0 when one message costs more than the budget", () => {
    expect(messagesForBudget(1000, 5000)).toBe(0);
  });
});

describe("computeSizeResult", () => {
  const medium = MESSAGE_SIZES.find((s) => s.id === "medium")!;

  it("agrees with the pieces it is built from (2.5 YER/credit, mid model, medium)", () => {
    const r = computeSizeResult(MID, medium, 2.5);
    expect(r.yerPerMessage).toBeCloseTo(11.25, 8); // 4.5 credits * 2.5
    expect(r.messages).toBe(88); // floor(1000 / 11.25)
    expect(r.chatYer).toBeCloseTo(creditsForChat(MID, medium, 10) * 2.5, 8);
    expect(r.remainingYer).toBeCloseTo(CALCULATOR_BUDGET_YER - r.chatYer, 8);
    expect(r.remainingPercent).toBeCloseTo((r.remainingYer / CALCULATOR_BUDGET_YER) * 100, 8);
  });

  it("clamps the remaining balance at zero instead of going negative", () => {
    const pricey = { creditsPerKInput: 15, creditsPerKOutput: 75 };
    const r = computeSizeResult(pricey, medium, 2.5);
    expect(r.chatYer).toBeGreaterThan(CALCULATOR_BUDGET_YER); // the chat really costs more than 1,000
    expect(r.remainingYer).toBe(0);
    expect(r.remainingPercent).toBe(0);
  });

  it("a free model costs nothing, leaves 100%, and has no message count", () => {
    const r = computeSizeResult(FREE, medium, 2.5);
    expect(r.messages).toBeNull();
    expect(r.yerPerMessage).toBe(0);
    expect(r.chatYer).toBe(0);
    expect(r.remainingPercent).toBe(100);
  });

  it("a bigger message never buys MORE messages than a smaller one", () => {
    const counts = MESSAGE_SIZES.map((s) => computeSizeResult(MID, s, 2.5).messages ?? 0);
    expect(counts[0]!).toBeGreaterThanOrEqual(counts[1]!);
    expect(counts[1]!).toBeGreaterThanOrEqual(counts[2]!);
  });
});

describe("MESSAGE_SIZES", () => {
  it("are ordered short < medium < long by total tokens", () => {
    const totals = MESSAGE_SIZES.map((s) => s.inputTokens + s.outputTokens);
    expect(totals[0]!).toBeLessThan(totals[1]!);
    expect(totals[1]!).toBeLessThan(totals[2]!);
  });
  it("has exactly the three ids the UI and messages depend on", () => {
    expect(MESSAGE_SIZES.map((s) => s.id)).toEqual(["short", "medium", "long"]);
  });
});

describe("isReassuring — the honesty gate for 'one chat never takes it all'", () => {
  it("is true at and above the threshold", () => {
    expect(isReassuring(REASSURING_MIN_REMAINING_PERCENT)).toBe(true);
    expect(isReassuring(72)).toBe(true);
    expect(isReassuring(100)).toBe(true);
  });
  it("is false just below the threshold and when the balance is gone", () => {
    expect(isReassuring(REASSURING_MIN_REMAINING_PERCENT - 0.01)).toBe(false);
    expect(isReassuring(12)).toBe(false);
    expect(isReassuring(0)).toBe(false);
  });
  it("is false for non-finite input (fails toward not-reassuring)", () => {
    expect(isReassuring(Number.NaN)).toBe(false);
    expect(isReassuring(Number.POSITIVE_INFINITY)).toBe(false);
  });
  it("is true for a free model (nothing is spent) and false for one chat that eats the budget", () => {
    const medium = MESSAGE_SIZES.find((s) => s.id === "medium")!;
    expect(isReassuring(computeSizeResult(FREE, medium, 2.5).remainingPercent)).toBe(true);
    const pricey = { creditsPerKInput: 15, creditsPerKOutput: 75 };
    expect(isReassuring(computeSizeResult(pricey, medium, 2.5).remainingPercent)).toBe(false);
  });
});
