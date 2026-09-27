/**
 * apps/web/features/chat/lib/model-selection.ts
 *
 * Phase 4c. Pure logic for the model picker — kept out of the component
 * so the two things that are easy to get wrong are unit-testable without
 * a DOM.
 *
 * `ChatModel` is a structural copy of the row shape returned by
 * `models.list` (apps/api/src/routers/models.router.ts), NOT an import of
 * the tRPC output type: features/chat's pure lib/ files stay free of the
 * tRPC/React-Query graph so vitest can import them under
 * `environment: "node"`. A component that receives real `models.list`
 * data passes it in structurally (it satisfies this interface). If the
 * router's shape drifts, the picker component's call site is where
 * `tsc` will catch it.
 *
 * UNITS — read before touching pricing display: `creditsPerKInput` /
 * `creditsPerKOutput` are already DISPLAY credits per 1K tokens (the
 * router computes `Math.ceil(wholesalePerM * markup / 1000 /
 * CREDIT_VALUE_USD)`). They are NOT micro-credits. Do NOT pass them
 * through lib/format.ts's formatCredits(), which divides by 1,000,000 and
 * would render 0.00001. They are formatted with plain locale number
 * formatting in the picker.
 */
export interface ChatModel {
  id: string;
  displayName: string;
  displayNameAr: string;
  badge: string;
  provider: string;
  /** Admin override of the displayed brand icon; null/undefined = auto-detect from `provider`. */
  providerIconKey?: string | null | undefined;
  tier: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  /** Feature-flag keys from MODEL_CATEGORY_KEYS (@ai-platform/config). */
  categories?: string[] | null | undefined;
  /** Admin-entered benchmark scores (0-100) keyed by
   *  LEADERBOARD_CATEGORY_KEYS (@ai-platform/config) — e.g.
   *  { reasoning: 91.7, coding: 86.4 }. See lib/model-ranking.ts for how
   *  the model picker uses these to rank/sort within a category tab. */
  categoryScores?: Record<string, number> | null | undefined;
  avgResponseTimeMs: number | null;
  creditsPerKInput: number;
  creditsPerKOutput: number;
  /** Optional exact (fractional) display credits per 1K tokens. `models.list`
   *  does not return these yet (it rounds the two fields above UP); when a
   *  future additive backend change does, lib/cost-estimate.ts prefers them.
   *  Provisional names. */
  creditsPerKInputExact?: number | undefined;
  creditsPerKOutputExact?: number | undefined;
}

/**
 * Decide which model is selected.
 *
 * Priority: (0) a model the user explicitly picked THIS session, (1) the
 * model the CURRENT conversation already uses, (2) the last-picked model
 * from localStorage, (3) the first available model.
 *
 * Tier 0 exists because tiers 1 and 2 alone make the picker unresponsive
 * on an existing conversation: `conversationModelId` outranks the
 * persisted last-pick, so clicking a different model would update
 * localStorage but the picker would keep showing the conversation's
 * model — the click would appear to do nothing.
 * Every candidate is checked against `available` — a stored id can point
 * at a model that has since been unpublished, disabled, or had its
 * channel removed (models.list only returns published + available rows).
 * Returning a stale id would send the user's next message to a
 * MODEL_NOT_FOUND / MODEL_UNAVAILABLE error, so a stale id silently falls
 * through to the next candidate instead.
 *
 * Returns `undefined` only when no models are available at all (the
 * picker shows its own empty state; Send stays blocked).
 */
export function resolveSelectedModelId(
  available: readonly ChatModel[],
  candidates: {
    sessionPickedModelId?: string | undefined;
    conversationModelId?: string | undefined;
    lastPickedModelId?: string | undefined;
  },
): string | undefined {
  const isAvailable = (id: string | undefined): id is string =>
    id !== undefined && available.some((m) => m.id === id);

  if (isAvailable(candidates.sessionPickedModelId)) return candidates.sessionPickedModelId;
  if (isAvailable(candidates.conversationModelId)) return candidates.conversationModelId;
  if (isAvailable(candidates.lastPickedModelId)) return candidates.lastPickedModelId;
  return available[0]?.id;
}

/** Display name in the active locale. Falls back to the other language's
 *  name, then the raw id, so a row with an empty name never renders blank. */
export function modelDisplayName(model: ChatModel, locale: "ar" | "en"): string {
  const primary = locale === "ar" ? model.displayNameAr : model.displayName;
  const secondary = locale === "ar" ? model.displayName : model.displayNameAr;
  return primary.trim() || secondary.trim() || model.id;
}

/** "1.2s" / "850ms" / null (unknown → caller renders "—"). */
export function formatLatency(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/** "128K" / "1M" / "8,192" — compact context/output size. */
export function formatTokenSize(n: number): string {
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `${n / 1_000_000}M`;
  if (n >= 1_000 && n % 1_000 === 0) return `${n / 1_000}K`;
  return n.toLocaleString("en-US");
}
