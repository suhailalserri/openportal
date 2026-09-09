-- ──────────────────────────────────────────────────────────────────────
-- PostgreSQL initialization — runs ONCE at container first-boot.
-- ONLY contains things that must exist before Drizzle migrations run.
-- Table-dependent objects (constraints, indexes, cron jobs) are in
-- packages/db/src/migrations/0001_constraints.sql
-- ──────────────────────────────────────────────────────────────────────

-- Extension: pg_cron for scheduled maintenance jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Trigger function: auto-update updated_at on any table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
