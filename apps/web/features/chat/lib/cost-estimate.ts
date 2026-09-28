import { tokenWeight, MESSAGE_OVERHEAD_TOKENS } from "./token-estimate";

/**
 * apps/web/features/chat/lib/cost-estimate.ts
 *
 * Phase 4c (rework). Pre-send COST QUOTE for the composer's
 * "≈ X credits · input" line.
 *
 * RULE 1 (plan §3) says money is never computed client-side. This is the
 * one deliberate, bounded exception, and it is bounded like this:
 *  - it is an ESTIMATE, always shown with "≈", never persisted, never sent
 *    to the server, never used to gate anything;
 *  - the authoritative number is still the server's per-message
 *    `creditCost` (rendered by the message component through
 *    formatCredits());
 *  - it leans high (see token-estimate.ts, and the round-up below).
 *
 * UNITS: `creditsPerKInput/Output` are DISPLAY credits per 1,000 tokens
 * (see model-selection.ts's header) — NOT micro-credits. The result here
 * is therefore also display credits and must not go through
 * formatCredits().
 *
 * PRICE PRECISION: `models.list` rounds credits-per-K UP to a whole number
 * (`Math.ceil` in models.router.ts), so a model that really costs 0.3
 * credits/K is listed as 1. Until the API also returns the exact figure,
 * a cheap model's quote is overstated by up to that rounding. When a model
 * row carries the optional exact fields (`creditsPerKInputExact` /
 * `creditsPerKOutputExact`, a future additive backend change — provisional
 * names), they are used and the quote becomes exact with no other change.
 */

export interface PricedModel {
  creditsPerKInput: number;
  creditsPerKOutput: number;
  /** Optional, exact (fractional) display credits per 1K input tokens. */
  creditsPerKInputExact?: number | undefined;
  /** Optional, exact (fractional) display credits per 1K output tokens. */
  creditsPerKOutputExact?: number | undefined;
}

export interface UnitPrice {
  /** Display credits per 1,000 tokens. */
  perK: number;
  /** False while only the API's rounded-up figure is available. */
  exact: boolean;
}

function usable(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

export function unitPrice(model: PricedModel, side: "input" | "output"): UnitPrice {
  const exact = side === "input" ? model.creditsPerKInputExact : model.creditsPerKOutputExact;
  if (usable(exact)) return { perK: exact, exact: true };
  const rounded = side === "input" ? model.creditsPerKInput : model.creditsPerKOutput;
  return { perK: usable(rounded) ? rounded : 0, exact: false };
}

export interface RequestTokenInput {
  /** Prior turns, oldest first. */
  history: readonly { content: string }[];
  /** The text in the composer. */
  draft: string;
}

/**
 * Estimated INPUT tokens of the request the server would send: every
 * prior turn + the draft, plus per-message framing. This is a conservative
 * upper bound now, not exact — the server may compact older turns into a
 * much shorter summary before billing (history-compaction.service.ts) and
 * also prepends its own system prompt whose length the client can't see.
 * Real cost is often lower than this quote in a long conversation, never
 * higher. Returns 0 when there is nothing to send.
 */
export function estimateRequestTokens(input: RequestTokenInput): number {
  const hasDraft = input.draft.trim().length > 0;
  if (input.history.length === 0 && !hasDraft) return 0;

  let weight = 0;
  let messages = 0;
  for (const m of input.history) {
    weight += tokenWeight(m.content);
    messages += 1;
  }
  if (hasDraft) {
    weight += tokenWeight(input.draft);
    messages += 1;
  }
  return Math.ceil(weight) + messages * MESSAGE_OVERHEAD_TOKENS;
}

/** Display credits for `tokens` at `perK` credits per 1,000 tokens. */
export function creditsForTokens(tokens: number, perK: number): number {
  if (!Number.isFinite(tokens) || !Number.isFinite(perK) || tokens <= 0 || perK <= 0) return 0;
  return (tokens / 1000) * perK;
}

/**
 * Round a quote UP for display: to 0.01 below 100 credits, to a whole
 * credit from 100 up. Up, never nearest — the server rounds up too, and an
 * under-quote is the bad direction. Any non-zero quote shows as at least
 * 0.01. Returned as a number; the caller formats it for the locale.
 */
export function roundQuoteUp(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  if (credits >= 100) return Math.ceil(credits);
  // Subtract a hair before ceil so 0.3 (= 0.30000000000000004 in floating
  // point) doesn't tick up to 0.31.
  return Math.ceil(credits * 100 - 1e-9) / 100;
}

/** Locale formatting for a rounded quote — Western digits in Arabic (D6). */
export function formatQuote(credits: number, locale: "ar" | "en"): string {
  return roundQuoteUp(credits).toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
    numberingSystem: "latn",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
