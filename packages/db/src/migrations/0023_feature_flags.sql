-- ──────────────────────────────────────────────────────────────────────
-- P6.3d — admin feature switches on the platform_config singleton
-- (see packages/db/src/schema/platform-config.ts).
--
-- Three booleans, all OFF by default: attachments, voice input, structured stream
-- ("thinking"). Nothing changes for any user until an admin flips one in /admin/features.
-- Apply BEFORE deploying the api: the api reads these columns (user.features) on every
-- chat page load, and selecting a missing column would fail that query. The web falls back
-- to "all off" if the query fails, so a wrong order hides the features instead of breaking chat.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS), safe to run twice. The singleton row from
-- migration 0014 keeps its id; existing rows get the default (false).
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0023_feature_flags.sql
-- (or paste it into the Supabase SQL editor)
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE platform_config
  ADD COLUMN IF NOT EXISTS feature_attachments boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_voice       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_thinking    boolean NOT NULL DEFAULT false;
