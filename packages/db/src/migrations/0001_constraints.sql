-- ──────────────────────────────────────────────────────────────────────
-- Post-schema migration: constraints, indexes, triggers, cron jobs.
-- Run AFTER Drizzle schema migrations (drizzle-kit migrate).
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0001_constraints.sql
-- Or add to your deploy script after db:migrate.
-- ──────────────────────────────────────────────────────────────────────

-- ── CONSTRAINTS ────────────────────────────────────────────────────────

-- Balance can NEVER go negative (final DB-level safety net)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credits_non_negative'
  ) THEN
    ALTER TABLE balances ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);
  END IF;
END $$;

-- ── INDEXES ────────────────────────────────────────────────────────────

-- Redeem codes: atomic single-use via unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_redeem_codes_unused
  ON redeem_codes(code) WHERE status = 'unused';

-- Transaction history (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions(user_id, created_at DESC);

-- Message history per conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at ASC);

-- Active conversations per user (excludes soft-deleted)
CREATE INDEX IF NOT EXISTS idx_conversations_user_active
  ON conversations(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Unresolved fraud events for admin dashboard
CREATE INDEX IF NOT EXISTS idx_fraud_events_unresolved
  ON fraud_events(created_at DESC)
  WHERE resolved = false;

-- Current provider prices
CREATE INDEX IF NOT EXISTS idx_provider_prices_current
  ON provider_prices(model_id, provider)
  WHERE effective_to IS NULL;

-- ── TRIGGER FUNCTION ──────────────────────────────────────────────────
-- Normally created by infra/postgres/init.sql on a local Docker Postgres
-- (via docker-entrypoint-initdb.d). Managed providers like Render never
-- run that file, so it's (re)created here too — idempotent either way.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── TRIGGERS ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS balances_updated_at ON balances;
CREATE TRIGGER balances_updated_at
  BEFORE UPDATE ON balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS models_updated_at ON models;
CREATE TRIGGER models_updated_at
  BEFORE UPDATE ON models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── CRON JOBS (pg_cron) ───────────────────────────────────────────────
-- pg_cron needs to be preloaded at the Postgres server level
-- (shared_preload_libraries), which most managed providers — Render's
-- standard plans included — don't expose to customers. This block is
-- best-effort: it logs a NOTICE and moves on instead of failing the
-- whole script if the extension can't be created or scheduled.
-- (The original version also had an invalid `ON CONFLICT` tacked onto a
-- `SELECT cron.schedule(...)` call, which isn't valid SQL — cron.schedule
-- already upserts by job name on its own, so it's just removed below.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;

  PERFORM cron.schedule(
    'nightly-data-pruning',
    '0 3 * * *',
    $sql$
      UPDATE redeem_codes
      SET status = 'expired'
      WHERE status = 'unused'
        AND expires_at IS NOT NULL
        AND expires_at < NOW();

      UPDATE conversations
      SET deleted_at = NOW()
      WHERE updated_at < NOW() - INTERVAL '90 days'
        AND deleted_at IS NULL
        AND is_pinned = false
        AND user_id IN (SELECT id FROM users WHERE tier = 'free');

      DELETE FROM audit_logs
      WHERE created_at < NOW() - INTERVAL '90 days';
    $sql$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable on this Postgres instance (%) — skipping scheduled cron jobs. Use your host''s own scheduler (e.g. Render Cron Jobs) instead if you need this.', SQLERRM;
END $$;
