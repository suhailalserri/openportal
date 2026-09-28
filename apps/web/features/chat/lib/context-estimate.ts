import { estimateTokenCount } from "@ai-platform/config";

/**
 * apps/web/features/chat/lib/context-estimate.ts
 *
 * Client-side approximation of the server's context usage, used only for
 * the "approaching the limit" warning hint — NOT a hard send-block
 * anymore. It used to mirror the server's pre-check exactly and gate
 * sending on it, but the server now compacts long conversations
 * (history-compaction.service.ts: a rolling summary replaces older turns
 * once ~50% of the context window is used), and the client has no
 * visibility into that summary or into the server-owned system prompt
 * length. Estimating against the full raw history would systematically
 * OVER-estimate and could block sends the server would actually handle
 * fine post-compaction — so `overLimit` here is advisory only; the
 * authoritative reject is still the server's CONTEXT_TOO_LONG response,
 * which the send flow already surfaces as an error.
 */

/** The fraction of a model's context window the server allows, pre-compaction. */
export const CONTEXT_LIMIT_RATIO = 0.95;

export interface ContextEstimateInput {
  /** Prior turns already in the conversation, oldest first. */
  history: readonly { content: string }[];
  /** The text currently in the composer (not yet sent). */
  draft: string;
}

export interface ContextEstimate {
  /** Estimated tokens for the full raw request, ignoring server-side
   *  compaction and the server-owned system prompt — an upper bound, not
   *  an exact figure. */
  tokens: number;
  /** Server-side hard limit for this model (`contextWindow * 0.95`). */
  limit: number;
  /** Advisory only — see file header. Not used to block sending. */
  overLimit: boolean;
}

export function estimateContext(
  input: ContextEstimateInput,
  contextWindow: number,
): ContextEstimate {
  const allText = [...input.history.map((m) => m.content), input.draft]
    .filter((t): t is string => Boolean(t))
    .join(" ");
  const tokens = estimateTokenCount(allText);
  const limit = contextWindow * CONTEXT_LIMIT_RATIO;
  return { tokens, limit, overLimit: tokens > limit };
}

/**
 * Fraction of the *server limit* consumed, clamped to [0, 1+]. Used only
 * to drive a "getting close" visual state; the hard block is `overLimit`.
 * Returns 0 for a non-positive limit rather than Infinity/NaN.
 */
export function contextUsageRatio(estimate: ContextEstimate): number {
  if (estimate.limit <= 0) return 0;
  return estimate.tokens / estimate.limit;
}

/** Show the soft "approaching the limit" hint from this usage ratio up. */
export const CONTEXT_WARN_RATIO = 0.8;
