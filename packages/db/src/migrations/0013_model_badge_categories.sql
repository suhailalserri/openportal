-- ──────────────────────────────────────────────────────────────────────
-- Badge becomes a curated preset key ("new" | "popular" | "recommended" |
-- "fast" | "budget" | "flagship" | "smart" | "beta" | "deprecated" | "")
-- instead of freeform text/emoji, so it renders as a consistent icon+color
-- chip (apps/web/components/icons/model-badge.tsx) instead of whatever an
-- admin typed. The old 10-char column already only ever held emoji/short
-- text; existing values that don't match a known preset key just render
-- with no icon (see the component) rather than breaking, so no data
-- migration/backfill is required here — only widen the column.
--
-- `categories` is a new admin-toggled feature-flag list (vision, coding,
-- reasoning, web search, ...) — see MODEL_CATEGORY_KEYS in
-- packages/config/src/model-metadata.config.ts for the source of truth on
-- valid values. Chosen as text[] rather than one boolean column per
-- feature so new categories never require a schema migration.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0013_model_badge_categories.sql
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE models ALTER COLUMN badge TYPE varchar(20);

ALTER TABLE models ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';
