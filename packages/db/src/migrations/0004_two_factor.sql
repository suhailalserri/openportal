-- ──────────────────────────────────────────────────────────────────────
-- Settings page / Security section — wires up the twoFactorEnabled /
-- twoFactorSecret columns that existed in the schema but were never
-- backed by a working feature (see apps/web/lib/auth.ts for the plugin
-- wiring and packages/db/src/schema/two-factor.ts for why this table,
-- not the legacy `users.two_factor_secret` column, is what actually
-- stores the TOTP secret + backup codes).
--
-- Written idempotently (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS throughout) so it's safe to re-run whether or not an earlier,
-- incomplete version of this migration — missing `locked_until` below,
-- per a "Drizzle schema mismatch" error better-auth logged at deploy
-- time — already ran against this database.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0004_two_factor.sql
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS two_factor (
  id                        text PRIMARY KEY,
  user_id                   uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  secret                    text NOT NULL,
  backup_codes              text NOT NULL,
  verified                  boolean NOT NULL DEFAULT false,
  failed_verification_count integer NOT NULL DEFAULT 0,
  locked_until              timestamp,
  created_at                timestamp NOT NULL DEFAULT now(),
  updated_at                timestamp NOT NULL DEFAULT now()
);

ALTER TABLE two_factor ADD COLUMN IF NOT EXISTS locked_until timestamp;
