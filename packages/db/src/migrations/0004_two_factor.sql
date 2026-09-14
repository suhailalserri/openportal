-- ──────────────────────────────────────────────────────────────────────
-- Settings page / Security section — wires up the twoFactorEnabled /
-- twoFactorSecret columns that existed in the schema but were never
-- backed by a working feature (see apps/web/lib/auth.ts for the plugin
-- wiring and packages/db/src/schema/two-factor.ts for why this table,
-- not the legacy `users.two_factor_secret` column, is what actually
-- stores the TOTP secret + backup codes).
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
  created_at                timestamp NOT NULL DEFAULT now(),
  updated_at                timestamp NOT NULL DEFAULT now()
);
