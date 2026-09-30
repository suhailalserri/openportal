-- ──────────────────────────────────────────────────────────────────────
-- P5.2a — attachments table (see packages/db/src/schema/attachments.ts).
--
-- One row per file attached to a conversation; `id` is the storage_objects.id of the
-- uploaded object (migration 0021 must already be applied). Nothing reads it until the
-- api that ships with P5.2a is deployed, so applying this first is always safe.
-- Apply BEFORE deploying the api.
--
-- Idempotent (IF NOT EXISTS / guarded constraints), safe to run twice.
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0022_attachments.sql
-- (or paste it into the Supabase SQL editor)
--
-- RLS on, no policies: same default-deny posture as 0007 / 0017 / 0019 / 0021.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attachments (
  id              uuid PRIMARY KEY REFERENCES storage_objects(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id),
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  file_name       varchar(255) NOT NULL,
  mime_type       varchar(100) NOT NULL,
  size_bytes      bigint       NOT NULL,
  kind            varchar(16)  NOT NULL,
  status          varchar(16)  NOT NULL DEFAULT 'uploading',
  error_code      varchar(32),
  extracted_text  text,
  extracted_chars integer,
  truncated       boolean      NOT NULL DEFAULT false,
  created_at      timestamp    NOT NULL DEFAULT now(),
  updated_at      timestamp    NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_status_check') THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_status_check
      CHECK (status IN ('uploading', 'processing', 'ready', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_kind_check') THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_kind_check
      CHECK (kind IN ('image', 'document', 'audio'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attachments_user_status     ON attachments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_attachments_status_updated  ON attachments (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_attachments_conversation    ON attachments (conversation_id);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
