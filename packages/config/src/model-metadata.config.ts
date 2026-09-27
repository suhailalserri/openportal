/**
 * packages/config/src/model-metadata.config.ts
 *
 * Single source of truth for the two admin-curated "tag" concepts on a
 * model row: `badge` (one status/marketing label) and `categories`
 * (a list of feature flags — what the model can actually do).
 *
 * WHY THIS LIVES IN packages/config AND NOT apps/web:
 * `apps/api` validates admin input against these same key lists (see
 * models.router.ts's `publish` procedure), and packages/config is the
 * one package both `apps/api` and `apps/web` already depend on for
 * model-related constants (CREDIT_VALUE_USD, MODEL_CATALOG, ...). Icons
 * and colors are presentation and stay in apps/web
 * (components/icons/model-badge.tsx, components/icons/model-category.tsx)
 * — this file only defines the *keys* both layers must agree on.
 *
 * BADGE — curated preset, one per model (or none). Deliberately NOT
 * freeform text/emoji: a fixed set means every badge renders with a
 * consistent icon + color instead of depending on an admin picking a
 * good emoji, and it's directly localizable (label comes from
 * messages/{ar,en}.json under `admin.modelsPage.badges.*`, not typed by
 * hand per model).
 *
 * CATEGORIES — a flexible list, not fixed boolean columns. Chosen over
 * one boolean-per-feature (the `supportsVision` pattern) specifically so
 * that adding "supports audio" or "supports video" next quarter is a
 * one-line edit here plus a migration-free `categories` array update —
 * not a new column + a schema migration + a new field threaded through
 * every layer, every time a provider ships a new capability. Order here
 * is also the display order everywhere categories are rendered.
 */

export const MODEL_BADGE_KEYS = [
  "new",
  "popular",
  "recommended",
  "fast",
  "budget",
  "flagship",
  "smart",
  "beta",
  "deprecated",
  // Not an admin-picked preset (it's derived at render time from price,
  // see model-picker.tsx's `isFree`), but it shares the same Record type
  // as the admin presets in components/icons/model-badge.tsx
  // (MODEL_BADGE_ICONS / MODEL_BADGE_VARIANTS), so it has to be a member
  // of this union or those Records fail to typecheck.
  "free",
] as const;

export type ModelBadgeKey = (typeof MODEL_BADGE_KEYS)[number];

export function isModelBadgeKey(value: string): value is ModelBadgeKey {
  return (MODEL_BADGE_KEYS as readonly string[]).includes(value);
}

/**
 * Badge presets an ADMIN can actually pick (everything in MODEL_BADGE_KEYS
 * except "free", which is derived at render time from price — see
 * apps/web/components/icons/model-badge.tsx's `isFree` usage in the chat
 * model picker, never set via the admin form). Shared from here (not
 * redeclared separately in the admin picker component and the API
 * router) so the client-side `PublishModelInput.badge` type and the
 * server's `publish` procedure input always agree — a mismatch there is
 * exactly what caused "Argument of type 'PublishModelInput' is not
 * assignable to parameter of type ...". Spelled out as a literal tuple
 * (not `MODEL_BADGE_KEYS.filter(...)`) because zod's `z.enum()` requires
 * a `[string, ...string[]]` tuple type, which `.filter()` can't produce;
 * `satisfies` below still keeps this checked against MODEL_BADGE_KEYS so
 * the two can't drift silently.
 */
export const ADMIN_BADGE_KEYS = [
  "new",
  "popular",
  "recommended",
  "fast",
  "budget",
  "flagship",
  "smart",
  "beta",
  "deprecated",
] as const satisfies readonly Exclude<ModelBadgeKey, "free">[];

export type AdminBadgeKey = (typeof ADMIN_BADGE_KEYS)[number];

export const MODEL_CATEGORY_KEYS = [
  "vision",
  "imageGeneration",
  "audio",
  "video",
  "reasoning",
  "coding",
  "webSearch",
  "functionCalling",
  "longContext",
] as const;

export type ModelCategoryKey = (typeof MODEL_CATEGORY_KEYS)[number];

export function isModelCategoryKey(value: string): value is ModelCategoryKey {
  return (MODEL_CATEGORY_KEYS as readonly string[]).includes(value);
}

/**
 * LEADERBOARD_CATEGORY_KEYS — benchmark-style ranking categories, each
 * with its own admin-entered score (see `categoryScores` on the `models`
 * table). Deliberately a SEPARATE list from `MODEL_CATEGORY_KEYS` above:
 * that list is "can this model do X at all" (boolean feature flags —
 * vision, audio, ...); this list is "how good is this model at X"
 * (a 0-100 benchmark score per category, modeled on the categories shown
 * on livebench.ai's leaderboard: Reasoning, Coding, Agentic Coding,
 * Mathematics, Data Analysis, Language, Instruction Following). An admin
 * fills these in from a public benchmark (LiveBench or similar); the chat
 * model picker's category tabs then rank models within a tab by that
 * category's own score — not by one blended "overall" number — so a
 * model that leads specifically at Coding surfaces first under the
 * Coding tab even if another model has a higher overall average.
 *
 * "overall" is included as a synthetic category (the picker's "All"
 * tab): admins may enter it directly (e.g. LiveBench's own overall
 * score) or leave it unset, in which case the picker falls back to the
 * mean of whatever per-category scores ARE set (see
 * `resolveCategoryScore` in apps/web/features/chat/lib/model-ranking.ts).
 */
export const LEADERBOARD_CATEGORY_KEYS = [
  "overall",
  "reasoning",
  "coding",
  "agenticCoding",
  "mathematics",
  "dataAnalysis",
  "language",
  "instructionFollowing",
] as const;

export type LeaderboardCategoryKey = (typeof LEADERBOARD_CATEGORY_KEYS)[number];

export function isLeaderboardCategoryKey(value: string): value is LeaderboardCategoryKey {
  return (LEADERBOARD_CATEGORY_KEYS as readonly string[]).includes(value);
}

/** Categories a model can be ranked in besides the synthetic "overall" tab. */
export const RANKED_LEADERBOARD_CATEGORY_KEYS = LEADERBOARD_CATEGORY_KEYS.filter(
  (k): k is Exclude<LeaderboardCategoryKey, "overall"> => k !== "overall",
);

/** Shape of the `categoryScores` column: partial map of category → 0-100 score. */
export type ModelCategoryScores = Partial<Record<LeaderboardCategoryKey, number>>;
