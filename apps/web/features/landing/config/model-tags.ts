/**
 * apps/web/features/landing/config/model-tags.ts
 *
 * THE FILE YOU EDIT to change the "Best for" column of the landing
 * page's models table.
 *
 * Why this is a hand-kept list and not LiveBench scores: LiveBench
 * (livebench.ai) is a public benchmark, but no licence for republishing
 * its scores was found, and this platform's model ids are OpenRouter-
 * style (e.g. "nex-agi/nex-n2.5-pro:free"), which do not map to
 * LiveBench's names automatically anyway. So the table shows our own
 * short tags, and the full LiveBench leaderboard is embedded next to it
 * (see components/livebench-embed.tsx) with attribution. Adding score
 * numbers here would need LiveBench's permission first.
 *
 * HOW A ROW'S TAGS ARE CHOSEN (see tagsForModel):
 *   0. if the admin has toggled real categories for this model
 *      (models.categories in /admin/models — see CATEGORY_TO_TAG below),
 *      those win outright and steps 1-2 are skipped entirely;
 *   1. otherwise, an exact entry in CURATED_TAGS (matched on the model id),
 *   2. else every PATTERN_RULES entry whose regex matches the model id,
 *   3. PLUS, always, tags derived from the data itself (vision support, a
 *      very long context window),
 *   4. capped at MAX_TAGS; if nothing applies the row shows "general".
 *
 * The starter values below are generic, widely-held impressions of each
 * model family. They are NOT benchmark results — review them before
 * launch. Tag labels are translated in messages/{ar,en}.json under
 * `landing.tags.*`; to add a tag, add it to MODEL_TAGS AND to both files.
 */

export const MODEL_TAGS = [
  "general",
  "coding",
  "reasoning",
  "writing",
  "math",
  "vision",
  "fast",
  "longContext",
] as const;

export type ModelTag = (typeof MODEL_TAGS)[number];

/** Max tags shown per row — keeps the column readable on a phone. */
export const MAX_TAGS = 3;

/** A context window at or above this earns the "longContext" tag. */
export const LONG_CONTEXT_TOKENS = 200_000;

/** Exact model id -> tags. Edit freely. */
export const CURATED_TAGS: Readonly<Record<string, readonly ModelTag[]>> = {
  "gpt-4o": ["general", "writing", "vision"],
  "gpt-4o-mini": ["fast", "general"],
  "claude-opus-4-8": ["reasoning", "coding", "writing"],
  "claude-sonnet-4-6": ["coding", "writing", "general"],
  "gemini-2.5-pro": ["reasoning", "longContext", "vision"],
  "gemini-2.5-flash": ["fast", "longContext"],
  "deepseek-r2": ["reasoning", "math", "coding"],
};

/**
 * Fallback for ids not listed above (e.g. OpenRouter-style ids). Patterns
 * match whole delimiter-separated TOKENS of the id (split on - / : _ .),
 * so "mini" matches "gpt-4o-mini" but NOT "gemini-3-ultra".
 */
const D = "(^|[-/:_.])";
const E = "($|[-/:_.])";
export const PATTERN_RULES: ReadonlyArray<{ pattern: RegExp; tags: readonly ModelTag[] }> = [
  { pattern: new RegExp(`${D}(coder|codestral|code)${E}`, "i"), tags: ["coding"] },
  {
    pattern: new RegExp(`${D}(r1|r2|o1|o3|o4|thinking|reasoner|reasoning)${E}`, "i"),
    tags: ["reasoning", "math"],
  },
  {
    pattern: new RegExp(`${D}(mini|flash|haiku|lite|nano|instant|small)${E}`, "i"),
    tags: ["fast"],
  },
  { pattern: new RegExp(`${D}(opus|pro|ultra|max)${E}`, "i"), tags: ["reasoning"] },
  { pattern: new RegExp(`${D}sonnet${E}`, "i"), tags: ["coding", "writing"] },
];

export interface TaggableModel {
  id: string;
  supportsVision: boolean;
  contextWindow: number;
  /** Admin-set feature flags from MODEL_CATEGORY_KEYS (@ai-platform/config),
   *  e.g. ["vision", "coding", "reasoning"]. When present and non-empty,
   *  these take priority over CURATED_TAGS/PATTERN_RULES below — an admin
   *  explicitly toggling "this model does coding" in /admin/models is a
   *  stronger signal than a guess from the model's id string, so the
   *  public "Best for" column should reflect it directly. */
  categories?: readonly string[] | null;
}

/** Maps a MODEL_CATEGORY_KEYS entry to the closest ModelTag. Categories
 *  with no landing-page equivalent (imageGeneration, audio, video,
 *  webSearch, functionCalling) are intentionally left out — they still
 *  render as icons in the admin table, they just don't have a "Best for"
 *  tag on the public page yet. */
const CATEGORY_TO_TAG: Readonly<Partial<Record<string, ModelTag>>> = {
  vision: "vision",
  reasoning: "reasoning",
  coding: "coding",
  longContext: "longContext",
};

/** Resolve the (deduplicated, capped) tag list for one model. */
export function tagsForModel(model: TaggableModel): ModelTag[] {
  const out: ModelTag[] = [];
  const add = (tags: readonly ModelTag[]) => {
    for (const t of tags) if (!out.includes(t)) out.push(t);
  };

  const adminCategories = (model.categories ?? []).filter((c): c is string => !!c);

  if (adminCategories.length > 0) {
    // Admin toggled real categories for this model — use them as the
    // primary source instead of guessing from the id string.
    for (const c of adminCategories) {
      const tag = CATEGORY_TO_TAG[c];
      if (tag) add([tag]);
    }
  } else {
    const curated = CURATED_TAGS[model.id];
    if (curated) {
      add(curated);
    } else {
      for (const rule of PATTERN_RULES) {
        if (rule.pattern.test(model.id)) add(rule.tags);
      }
    }
  }

  if (model.supportsVision) add(["vision"]);
  if (model.contextWindow >= LONG_CONTEXT_TOKENS) add(["longContext"]);

  if (out.length === 0) return ["general"];
  return out.slice(0, MAX_TAGS);
}
