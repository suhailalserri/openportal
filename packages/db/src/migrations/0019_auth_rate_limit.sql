-- ──────────────────────────────────────────────────────────────────────
-- P3.5 — shared login / auth rate-limit counters.
--
-- Table required by better-auth when apps/web/lib/auth.ts sets
-- `rateLimit.storage: "database"` (see packages/db/src/schema/rate-limit.ts).
--
-- ORDER MATTERS: apply this to the production database BEFORE the deploy that
-- contains the auth.ts change. With the table missing, every /api/auth request
-- fails, which is a login outage. Idempotent (IF NOT EXISTS), safe to run twice.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0019_auth_rate_limit.sql
-- (or paste it into the Supabase SQL editor)
--
-- RLS is enabled with no policies, same default-deny posture as 0007 / 0017:
-- the app connects as the table owner, so this only closes Supabase's public
-- REST API for this table.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit (
  id           text PRIMARY KEY,
  key          text NOT NULL,
  count        integer NOT NULL,
  last_request bigint NOT NULL
);

-- `key` is indexed but NOT unique on purpose (see schema/rate-limit.ts).
CREATE INDEX IF NOT EXISTS idx_rate_limit_key ON rate_limit (key);
-- Used by the daily prune (DELETE ... WHERE last_request < cutoff).
CREATE INDEX IF NOT EXISTS idx_rate_limit_last_request ON rate_limit (last_request);

ALTER TABLE rate_limit ENABLE ROW LEVEL SECURITY;
