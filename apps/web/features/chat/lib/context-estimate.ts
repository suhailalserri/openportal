import { estimateTokenCount } from "@ai-platform/config";

/**
 * apps/web/features/chat/lib/context-estimate.ts
 *
 * Phase 4c. Mirrors the server's context pre-check EXACTLY so the client's
 * "Send is disabled" state and the server's CONTEXT_TOO_LONG 400 can never
 * disagree. The source of truth is apps/api/src/services/gateway.service.ts
 * (streamChat, "Estimate token count to pre-validate"):
 *
 *   const allText = [opts.systemPrompt, ...opts.messages.map(m => m.content)]
 *     .filter((t): t is string => Boolean(t))
 *     .join(" ");
 *   const estTokens = estimateTokenCount(allText);   // Math.ceil(len / 4)
 *   if (estTokens > model.contextWindow * 0.95) -> CONTEXT_TOO_LONG
 *
 * Three details that are easy to get wrong and that this file pins:
 *  1. The estimate covers the WHOLE request — system prompt + every prior
 *     message + the draft — not just the draft. A short draft in a long
 *     conversation can still overflow.
 *  2. Segments are joined with a single space (so N segments add N-1
 *     characters). Empty/undefined segments are dropped BEFORE joining.
 *  3. The limit is `contextWindow * 0.95` and the comparison is strictly
 *     greater-than: exactly at the limit is still allowed.
 *
 * `estimateTokenCount` is imported from @ai-platform/config (already a
 * dependency of apps/web, and already imported by lib/format.ts) rather
 * than re-implemented, so a future change to the server's heuristic can't
 * silently desynchronise the client.
 */

/** The fraction of a model's context window the server allows. */
export const CONTEXT_LIMIT_RATIO = 0.95;

export interface ContextEstimateInput {
  systemPrompt?: string | undefined;
  /** Prior turns already in the conversation, oldest first. */
  history: readonly { content: string }[];
  /** The text currently in the composer (not yet sent). */
  draft: string;
}

export interface ContextEstimate {
  /** Estimated tokens for the full request the server would see. */
  tokens: number;
  /** Server-side hard limit for this model (`contextWindow * 0.95`). */
  limit: number;
  /** True when the server would reject this with CONTEXT_TOO_LONG. */
  overLimit: boolean;
}

export function estimateContext(
  input: ContextEstimateInput,
  contextWindow: number,
): ContextEstimate {
  const allText = [input.systemPrompt, ...input.history.map((m) => m.content), input.draft]
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
