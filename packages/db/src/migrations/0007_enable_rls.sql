-- ──────────────────────────────────────────────────────────────────────
-- CRITICAL SECURITY FIX — Row-Level Security was disabled on every public
-- table. Supabase auto-generates a public REST API (PostgREST) over every
-- table in the `public` schema regardless of whether the app uses it.
-- Without RLS, that API has NO access control: anyone with the project
-- URL can read/edit/delete any row via the `anon` key, including
-- passwordHash, apiKeyHash, twoFactorSecret, and credit balances.
--
-- This app's backend (apps/api) connects via a direct Postgres connection
-- string (DATABASE_URL), not through Supabase's client/anon key. That
-- connection role owns these tables, and table owners bypass RLS by
-- default in Postgres — so enabling RLS here has ZERO effect on the
-- Fastify/Drizzle app. It only removes anonymous/authenticated access
-- through Supabase's separate REST API.
--
-- No policies are added intentionally: RLS enabled + zero policies means
-- default-deny for every non-owner role (anon, authenticated). That is
-- the correct posture here, since nothing in this app is meant to be
-- queried directly via Supabase's REST API from a browser.
--
-- Run immediately in the Supabase SQL Editor (production is exposed
-- right now), then apply as part of the normal migration flow going
-- forward: psql $DATABASE_URL < packages/db/src/migrations/0007_enable_rls.sql
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE accounts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE balances                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE models                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_manual_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_prices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE redeem_codes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE two_factor               ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications            ENABLE ROW LEVEL SECURITY;

-- ── Verification query — run after applying ─────────────────────────────
-- Every row below must show rowsecurity = true. Any row showing `f` means
-- that table is still exposed and this migration didn't apply to it.
--
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
