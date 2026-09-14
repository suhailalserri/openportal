-- ──────────────────────────────────────────────────────────────────────
-- Referral program — `referral_code` and `referred_by_user_id` already
-- existed on `users` (and `referral_bonus` was already a valid
-- `tx_type`), but nothing ever generated a code, captured who referred
-- whom, or awarded a bonus. This migration adds the one missing piece:
-- an idempotency guard so the award can only ever fire once per referred
-- user. See apps/api/src/services/referral.service.ts and
-- apps/web/lib/auth.ts, and decisions.md ADR-009 for the full design.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0005_referrals.sql
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_bonus_awarded_at timestamp;
