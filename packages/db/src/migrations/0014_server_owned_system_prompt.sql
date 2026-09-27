-- ──────────────────────────────────────────────────────────────────────
-- Removes the old per-conversation `system_prompt` column entirely. It was
-- fully client-supplied (chat.schema.ts `systemPrompt` field, settable via
-- PATCH /api/conversations/[id]) — there was never a server/admin-owned
-- prompt, so anything resembling "platform rules" only existed if the
-- client chose to send them. Product decision: users don't need this
-- control, so it's removed rather than kept alongside the new layers below.
--
-- Replaces it with two ADMIN-ONLY layers, assembled server-side in
-- gateway.service.ts and never accepted from the /chat request body:
--   1. platform_config.base_prompt   — one global row, applies to every model
--   2. models.system_prompt          — optional per-model addition
--
-- Also adds the rolling-history-summary columns on `conversations`, used
-- to bound how much of a long conversation gets resent to the provider on
-- every turn instead of the full raw history every time. Raw messages are
-- never deleted — this only controls what's sent to the model, not what's
-- stored.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0014_server_owned_system_prompt.sql
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE conversations DROP COLUMN IF EXISTS system_prompt;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summarized_message_count integer NOT NULL DEFAULT 0;

ALTER TABLE models ADD COLUMN IF NOT EXISTS system_prompt text;

CREATE TABLE IF NOT EXISTS platform_config (
  id                  uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  base_prompt         text,
  updated_at          timestamp NOT NULL DEFAULT now(),
  updated_by_admin_id uuid REFERENCES users(id)
);

-- Seed the single row so `SELECT ... WHERE id = '...0001'` (or an upsert)
-- always has something to find/update, rather than every caller needing an
-- "insert if missing" branch.
INSERT INTO platform_config (id, base_prompt)
VALUES ('00000000-0000-0000-0000-000000000001', NULL)
ON CONFLICT (id) DO NOTHING;
