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
 * FALLBACK FOR AN UNSCORED CATEGORY: a model missing a score for just one
 * tab still needs a stable position (an admin can easily forget one
 * field). `resolveCategoryScore` falls back to the mean of the model's
 * OTHER scores, but only once there are at least two of them — a model
 * with a single lonely score (e.g. only Mathematics: 66) has no real
 * signal for Reasoning or Coding, so it must NOT rank there off that one
 * number; see MIN_SCORES_FOR_FALLBACK below. A fully-scored flagship
 * model still outranks a barely-benchmarked one, without hard-coding a
 * magic "0" that would bury a deliberately low-scoring model too.
 */
import { LEADERBOARD_CATEGORY_KEYS, RANKED_LEADERBOARD_CATEGORY_KEYS } from "@ai-platform/config";
import type { LeaderboardCategoryKey } from "@ai-platform/config";
import type { ChatModel } from "./model-selection";

export type { LeaderboardCategoryKey };
export { LEADERBOARD_CATEGORY_KEYS };

/**
 * The score to sort/display a model by for a given tab.
 *  - explicit score for that category → use it
 *  - otherwise, if the model has scores for at least MIN_SCORES_FOR_FALLBACK
 *    other ranked categories → the mean of those (a genuinely
 *    well-benchmarked model shouldn't sink to the bottom of the one tab
 *    an admin forgot to fill in)
 *  - otherwise (zero, or only one, other score on file) → undefined, so
 *    the model doesn't get ranked in a tab it has no real signal for.
 *    Without this floor, a model scored in exactly ONE category (e.g.
 *    only Mathematics: 66) would have that single number stand in as its
 *    "mean" everywhere else too — surfacing a Mathematics-only model as
 *    a top Reasoning/Coding pick it was never actually benchmarked for.
 */
const MIN_SCORES_FOR_FALLBACK = 2;

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
  if (others.length < MIN_SCORES_FOR_FALLBACK) return undefined;
  return others.reduce((sum, v) => sum + v, 0) / others.length;
}

/** True if the model has a directly admin-entered score for this
 *  category — deliberately NOT `resolveCategoryScore(...) !== undefined`:
 *  that function's fallback (mean of a model's OTHER scores) exists so a
 *  partially-scored model still has a sortable position within a tab
 *  that's already showing (e.g. under Coding when only overall/reasoning
 *  are set) — it isn't meant to manufacture coverage for a category
 *  nobody actually scored. Using it here would make every category with
 *  at least one filled-in field "covered" by every model, via that same
 *  cross-category mean, which would surface a tab (e.g. Data Analysis)
 *  even though not one model has a real Data Analysis number. */
function hasDirectScore(model: ChatModel, category: LeaderboardCategoryKey): boolean {
  const direct = (model.categoryScores ?? {})[category];
  return typeof direct === "number" && Number.isFinite(direct);
}

/** True if ANY model in the list has a directly admin-entered score for
 *  this category — used to decide whether a tab is worth showing. */
export function categoryHasCoverage(models: readonly ChatModel[], category: LeaderboardCategoryKey): boolean {
  return models.some((m) => hasDirectScore(m, category));
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
