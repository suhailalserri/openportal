/**
 * apps/web/features/chat/lib/model-ranking.ts
 *
 * Pure logic behind the category-tabbed model picker (see
 * ../components/composer/model-picker.tsx). Kept out of the component so
 * it's unit-testable without a DOM, same rationale as model-selection.ts.
 *
 * THE RANKING SOURCE — an admin fills in `categoryScores` on each model
 * (packages/db/src/schema/models.ts's `category_scores` jsonb column,
 * edited via the admin Models page) with numbers copied from a public
 * benchmark such as livebench.ai: one 0-100 score per entry in
 * LEADERBOARD_CATEGORY_KEYS (@ai-platform/config) — reasoning, coding,
 * agenticCoding, mathematics, dataAnalysis, language,
 * instructionFollowing, and the synthetic "overall" tab.
 *
 * WHY PER-CATEGORY RATHER THAN ONE BLENDED SCORE: the whole point of
 * this feature (see the product ask this implements) is that a model
 * can rank #1 specifically for Coding while trailing on overall — a
 * single "total" ranking would hide that. Each tab therefore sorts by
 * that category's own score, not by `overall`. Admins are expected to
 * transcribe LiveBench's own per-category breakdown, not just its
 * headline number — that's the whole value of this screen. This module
 * has no opinion on which benchmark the numbers come from; it only
 * consumes whatever 0-100 numbers are on the row.
 *
 * FALLBACK FOR AN UNSCORED MODEL: a model with no score at all for a
 * given category still needs a stable position (new models often lag
 * benchmark coverage). `resolveCategoryScore` falls back to the mean of
 * whatever OTHER category scores the model does have, so a fully-scored
 * flagship model still outranks a model nobody has benchmarked yet,
 * without hard-coding a magic "0" that would bury it below every
 * deliberately low-scoring model too.
 */
import { LEADERBOARD_CATEGORY_KEYS, RANKED_LEADERBOARD_CATEGORY_KEYS } from "@ai-platform/config";
import type { LeaderboardCategoryKey } from "@ai-platform/config";
import type { ChatModel } from "./model-selection";

export type { LeaderboardCategoryKey };
export { LEADERBOARD_CATEGORY_KEYS };

/**
 * The score to sort/display a model by for a given tab.
 *  - explicit score for that category → use it
 *  - "overall" with no explicit score → mean of the model's other scores
 *  - any other category with no explicit score → mean of its OTHER scores
 *    (never counts the tab itself, which by definition is unset here)
 *  - no scores at all → undefined (caller pushes it to the end, unsorted
 *    among its peers, rather than assuming a 0)
 */
export function resolveCategoryScore(
  model: ChatModel,
  category: LeaderboardCategoryKey,
): number | undefined {
  const scores = model.categoryScores ?? {};
  const direct = scores[category];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  const others = RANKED_LEADERBOARD_CATEGORY_KEYS.filter((k) => k !== category)
    .map((k) => scores[k])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (others.length === 0) return undefined;
  return others.reduce((sum, v) => sum + v, 0) / others.length;
}

/** True if ANY model in the list has a usable score for this category
 *  (direct or fallback) — used to decide whether a tab is worth showing. */
export function categoryHasCoverage(models: readonly ChatModel[], category: LeaderboardCategoryKey): boolean {
  return models.some((m) => resolveCategoryScore(m, category) !== undefined);
}

/**
 * Models for one tab, best first. Ties (including "no score at all",
 * which all sort as equal) keep the incoming order, so this is stable
 * for a `models` array that's already in a sensible default order.
 */
export function rankModelsForCategory(
  models: readonly ChatModel[],
  category: LeaderboardCategoryKey,
): readonly ChatModel[] {
  return models
    .map((model, index) => ({ model, index, score: resolveCategoryScore(model, category) }))
    .sort((a, b) => {
      if (a.score === undefined && b.score === undefined) return a.index - b.index;
      if (a.score === undefined) return 1;
      if (b.score === undefined) return -1;
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.model);
}

/**
 * Tabs to render: "overall" first, then every ranked category that has
 * at least one scored model, in LEADERBOARD_CATEGORY_KEYS's declared
 * order. A category nobody has scored yet simply doesn't get a tab,
 * rather than showing an empty/unsorted list.
 */
export function availableCategoryTabs(models: readonly ChatModel[]): readonly LeaderboardCategoryKey[] {
  const ranked = RANKED_LEADERBOARD_CATEGORY_KEYS.filter((key) => categoryHasCoverage(models, key));
  return ["overall", ...ranked];
}
