-- 0015_model_category_scores.sql
--
-- Adds `category_scores`: admin-entered per-category benchmark scores
-- (0-100), keyed by LEADERBOARD_CATEGORY_KEYS
-- (@ai-platform/config/model-metadata.config) — e.g. reasoning, coding,
-- agenticCoding, mathematics, dataAnalysis, language,
-- instructionFollowing, overall. Meant to be filled in from a public
-- benchmark such as livebench.ai. Used only to rank/sort models within
-- each category tab of the chat composer's model picker; it does not
-- affect billing, availability, or the existing boolean `categories`
-- feature-flag column, which is untouched by this migration.
ALTER TABLE "models"
  ADD COLUMN IF NOT EXISTS "category_scores" jsonb NOT NULL DEFAULT '{}'::jsonb;
