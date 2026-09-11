-- ──────────────────────────────────────────────────────────────────────
-- Adds the columns needed for gateway → DB model sync (New API is the
-- provider plumbing; this table is the business layer: pricing, display,
-- publish state). Existing rows (previously seeded from the static
-- MODEL_CATALOG) default to status='published' so nothing currently
-- live gets hidden by this migration.
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0002_model_sync.sql
-- ──────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE model_status AS ENUM ('pending', 'published', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS status model_status NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS wholesale_cost_input_per_m  numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wholesale_cost_output_per_m numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_limit_per_user_daily integer,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamp;

-- id was varchar(100); gateway model strings like
-- "inclusionai/ling-3.0-flash-fin:free" can exceed that.
ALTER TABLE models ALTER COLUMN id TYPE varchar(150);

-- Backfill wholesale costs for the models that were seeded from the old
-- static MODEL_CATALOG / WHOLESALE_COSTS map, so existing pricing doesn't
-- silently drop to 0 after this migration.
UPDATE models SET wholesale_cost_input_per_m = 5.00,   wholesale_cost_output_per_m = 15.00  WHERE id = 'gpt-4o';
UPDATE models SET wholesale_cost_input_per_m = 0.15,   wholesale_cost_output_per_m = 0.60   WHERE id = 'gpt-4o-mini';
UPDATE models SET wholesale_cost_input_per_m = 15.00,  wholesale_cost_output_per_m = 75.00  WHERE id = 'claude-opus-4-8';
UPDATE models SET wholesale_cost_input_per_m = 3.00,   wholesale_cost_output_per_m = 15.00  WHERE id = 'claude-sonnet-4-6';
UPDATE models SET wholesale_cost_input_per_m = 0.80,   wholesale_cost_output_per_m = 4.00   WHERE id = 'claude-haiku-4-5';
UPDATE models SET wholesale_cost_input_per_m = 1.25,   wholesale_cost_output_per_m = 10.00  WHERE id = 'gemini-2.5-pro';
UPDATE models SET wholesale_cost_input_per_m = 0.075,  wholesale_cost_output_per_m = 0.30   WHERE id = 'gemini-2.5-flash';
UPDATE models SET wholesale_cost_input_per_m = 0.55,   wholesale_cost_output_per_m = 2.19   WHERE id = 'deepseek-r2';
UPDATE models SET wholesale_cost_input_per_m = 0.27,   wholesale_cost_output_per_m = 1.10   WHERE id = 'deepseek-v3';

CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);
