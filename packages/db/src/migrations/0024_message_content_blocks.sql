-- ──────────────────────────────────────────────────────────────────────
-- P6.4 — persist structured assistant messages
-- (see packages/db/src/schema/messages.ts and packages/types/src/message-blocks.ts).
--
-- Adds messages.content_blocks: an ORDERED jsonb array of blocks (thinking / text / tool_use) that
-- is the source of truth for a reply streamed in v2. messages.content stays the flat text
-- projection (the concatenation of the text blocks) for search, export and model history.
-- NULL means "no structure recorded": every existing row and every v1 reply. Readers render NULL
-- as one text block made of `content`, so there is NO backfill.
--
-- Apply BEFORE deploying the api. The api now includes content_blocks in every assistant-message
-- insert and the web history read selects the column; on a database without it the insert fails
-- and the reply is not saved (the insert is fire-and-forget, so the chat itself still works).
--
-- Cheap on a big table: a nullable column with no default is metadata-only (no rewrite), and the
-- CHECK is added NOT VALID, so Postgres does not scan existing rows (they are all NULL anyway);
-- it is enforced for every new write. Idempotent, safe to run twice.
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0024_message_content_blocks.sql
-- (or paste it into the Supabase SQL editor)
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS content_blocks jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_content_blocks_is_array') THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_content_blocks_is_array
      CHECK (content_blocks IS NULL OR jsonb_typeof(content_blocks) = 'array') NOT VALID;
  END IF;
END
$$;
