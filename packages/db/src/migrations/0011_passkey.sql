-- ──────────────────────────────────────────────────────────────────────
-- Passkeys (WebAuthn) — table required by better-auth's passkey plugin
-- (see packages/db/src/schema/passkey.ts and apps/web/lib/auth.ts).
--
-- Idempotent (IF NOT EXISTS throughout) so it is safe to run twice.
-- Apply it to the production database BEFORE enabling
-- NEXT_PUBLIC_PASSKEY_ENABLED, otherwise registering/using a passkey fails.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0011_passkey.sql
-- (or paste it into the Supabase SQL editor)
--
-- RLS is enabled with no policies, same default-deny posture as 0007: the
-- app connects as the table owner, so this only closes off Supabase's
-- public REST API for this table.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS passkey (
  id            text PRIMARY KEY,
  name          text,
  public_key    text NOT NULL,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  counter       integer NOT NULL,
  device_type   text NOT NULL,
  backed_up     boolean NOT NULL,
  transports    text,
  created_at    timestamp DEFAULT now(),
  aaguid        text
);

CREATE INDEX IF NOT EXISTS passkey_user_id_idx ON passkey (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS passkey_credential_id_idx ON passkey (credential_id);

ALTER TABLE passkey ENABLE ROW LEVEL SECURITY;
