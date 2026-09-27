import { describe, it, expect } from "vitest";
import { estimateTokenCount } from "@ai-platform/config";

import {
  estimateContext,
  contextUsageRatio,
  CONTEXT_LIMIT_RATIO,
} from "./context-estimate";

/**
 * Client-side approximation of the server's context usage (upper-bound
 * only — see context-estimate.ts header for why it no longer mirrors the
 * server's pre-check exactly): history + draft, joined with " ",
 * ceil(len/4), strictly-greater-than `contextWindow * 0.95`.
 */
describe("estimateContext", () => {
  it("uses ceil(chars/4) — identical to the server's imported helper", () => {
    const draft = "x".repeat(41);
    const est = estimateContext({ history: [], draft }, 1_000_000);
    expect(est.tokens).toBe(estimateTokenCount(draft));
    expect(est.tokens).toBe(11); // ceil(41 / 4)
  });

  it("counts the WHOLE request: history + draft, not just the draft", () => {
    const est = estimateContext(
      {
        history: [{ content: "h".repeat(10) }, { content: "i".repeat(10) }],
        draft: "d".repeat(10),
      },
      1_000_000,
    );
    // 3 segments of 10 chars joined by 2 spaces = 32 chars → ceil(32/4) = 8
    expect(est.tokens).toBe(8);
  });

  it("joins with a single space, so N segments add N-1 characters", () => {
    const est = estimateContext({ history: [{ content: "aaaa" }], draft: "bbbb" }, 1_000_000);
    // "aaaa bbbb" = 9 chars → 3 tokens. Without the join space it would be 8 chars → 2.
    expect(est.tokens).toBe(3);
  });

  it("drops empty/undefined segments BEFORE joining (no stray spaces)", () => {
    const withEmpties = estimateContext(
      { history: [{ content: "" }, { content: "abcd" }], draft: "" },
      1_000_000,
    );
    const clean = estimateContext({ history: [{ content: "abcd" }], draft: "" }, 1_000_000);
    expect(withEmpties.tokens).toBe(clean.tokens);
    expect(withEmpties.tokens).toBe(1);
  });

  it("limit is contextWindow * 0.95", () => {
    expect(estimateContext({ history: [], draft: "" }, 1000).limit).toBe(950);
    expect(CONTEXT_LIMIT_RATIO).toBe(0.95);
  });

  it("is over the limit only when STRICTLY greater — exactly at the limit is allowed", () => {
    // window 100 → limit 95 tokens → 380 chars = exactly 95 tokens
    expect(estimateContext({ history: [], draft: "x".repeat(380) }, 100).overLimit).toBe(false);
    // one more char → ceil(381/4) = 96 tokens > 95
    expect(estimateContext({ history: [], draft: "x".repeat(381) }, 100).overLimit).toBe(true);
  });

  it("a short draft in a long conversation can still be over the limit", () => {
    const est = estimateContext(
      { history: [{ content: "y".repeat(4000) }], draft: "hi" },
      1000, // limit 950 tokens; history alone is 1000 tokens
    );
    expect(est.overLimit).toBe(true);
  });

  it("Arabic text is measured by UTF-16 length, same as the server's text.length", () => {
    const arabic = "مرحبا بالعالم"; // 13 UTF-16 code units
    expect(estimateContext({ history: [], draft: arabic }, 1_000_000).tokens).toBe(
      Math.ceil(arabic.length / 4),
    );
  });
});

describe("contextUsageRatio", () => {
  it("is tokens / limit", () => {
    const est = estimateContext({ history: [], draft: "x".repeat(190) }, 100); // 48 tokens / 95
    expect(contextUsageRatio(est)).toBeCloseTo(48 / 95, 5);
  });

  it("returns 0 (not Infinity/NaN) for a non-positive limit", () => {
    const est = estimateContext({ history: [], draft: "abc" }, 0);
    expect(contextUsageRatio(est)).toBe(0);
  });
});
