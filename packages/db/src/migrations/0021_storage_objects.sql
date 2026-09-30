-- ──────────────────────────────────────────────────────────────────────
-- P5.1 — Supabase Storage tracking table.
--
-- One row per uploaded object (see packages/db/src/schema/storage-objects.ts).
-- Nothing reads it until the api has SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set,
-- so applying this first is always safe. The api's storage features and the
-- cleanup job need it: apply BEFORE setting those two env vars on Render.
--
-- Idempotent (IF NOT EXISTS / guarded constraint), safe to run twice.
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0021_storage_objects.sql
-- (or paste it into the Supabase SQL editor)
--
-- RLS on, no policies: same default-deny posture as 0007 / 0017 / 0019.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS storage_objects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  conversation_id     uuid REFERENCES conversations(id) ON DELETE SET NULL,
  bucket              varchar(32)  NOT NULL,
  object_key          text         NOT NULL UNIQUE,
  mime_type           varchar(100) NOT NULL,
  declared_size_bytes bigint       NOT NULL,
  size_bytes          bigint,
  status              varchar(16)  NOT NULL DEFAULT 'pending',
  created_at          timestamp    NOT NULL DEFAULT now(),
  confirmed_at        timestamp,
  deleted_at          timestamp
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_objects_status_check') THEN
    ALTER TABLE storage_objects
      ADD CONSTRAINT storage_objects_status_check
      CHECK (status IN ('pending', 'confirmed', 'deleting', 'deleted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_storage_objects_user_status     ON storage_objects (user_id, status);
CREATE INDEX IF NOT EXISTS idx_storage_objects_user_created    ON storage_objects (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_storage_objects_status_created  ON storage_objects (status, created_at);
CREATE INDEX IF NOT EXISTS idx_storage_objects_conversation    ON storage_objects (conversation_id);

ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;
