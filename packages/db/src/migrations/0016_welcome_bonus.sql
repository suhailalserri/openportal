-- ──────────────────────────────────────────────────────────────────────
-- Welcome bonus for new users (decisions.md ADR-010).
--
--   * `welcome_bonus` becomes a valid `tx_type` so the credit shows up in
--     the user's transaction history with its own label.
--   * `users.welcome_bonus_claimed_at` is the once-only guard: the claim is
--     `UPDATE ... WHERE welcome_bonus_claimed_at IS NULL`, so it can only
--     ever match once per user (see welcome-bonus.service.ts).
--   * `platform_config` gets the admin toggle, the amount (micro-credits)
--     and the one-time launch stamp that defines who counts as a "new user".
--
-- The feature ships DISABLED (enabled = false, amount = 0): nothing is
-- granted until an admin turns it on at /admin/welcome-bonus.
--
-- IMPORTANT: run the ALTER TYPE statement on its own, BEFORE the rest, and
-- not inside a larger transaction — Postgres does not allow a newly added
-- enum value to be used in the same transaction that created it.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0016_welcome_bonus.sql
-- ──────────────────────────────────────────────────────────────────────

ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'welcome_bonus';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS welcome_bonus_claimed_at timestamp;

ALTER TABLE platform_config
  ADD COLUMN IF NOT EXISTS welcome_bonus_enabled       boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS welcome_bonus_micro_credits bigint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welcome_bonus_launched_at   timestamp;

-- Defence in depth: the amount can never be negative, whatever writes it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_config_welcome_bonus_nonneg'
  ) THEN
    ALTER TABLE platform_config
      ADD CONSTRAINT platform_config_welcome_bonus_nonneg
      CHECK (welcome_bonus_micro_credits >= 0);
  END IF;
END $$;
