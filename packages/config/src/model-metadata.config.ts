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
] as const;

export type ModelBadgeKey = (typeof MODEL_BADGE_KEYS)[number];

export function isModelBadgeKey(value: string): value is ModelBadgeKey {
  return (MODEL_BADGE_KEYS as readonly string[]).includes(value);
}

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
