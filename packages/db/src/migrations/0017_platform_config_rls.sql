-- ──────────────────────────────────────────────────────────────────────
-- SECURITY FIX (gap N10) — platform_config was created by 0014 AFTER the
-- blanket RLS pass in 0007, and no migration ever enabled RLS on it.
-- Supabase auto-exposes every public-schema table through its Data API
-- (PostgREST); a table with RLS off is readable/writable there with the
-- public `anon` key. See 0007_enable_rls.sql for the full rationale.
--
-- Same posture as 0007: RLS enabled, ZERO policies = default-deny for
-- every non-owner role (anon, authenticated). The app connects as the
-- table owner (DATABASE_URL), which bypasses RLS, so this has no effect
-- on apps/api or apps/web.
--
-- `_manual_migrations` (created by run-manual-migrations.ts) is covered
-- too. IF EXISTS keeps this a no-op on databases that lack either table
-- (e.g. the CI Postgres). Safe to run more than once.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0017_platform_config_rls.sql
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS platform_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS _manual_migrations ENABLE ROW LEVEL SECURITY;
