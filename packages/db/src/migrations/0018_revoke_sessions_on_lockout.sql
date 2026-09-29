-- ──────────────────────────────────────────────────────────────────────
-- P1.1 (gaps G2b / fraud path) — database-level session revocation.
--
-- When a user becomes suspended, or gets fraud-flagged, delete their
-- better-auth session rows in the same statement. This is the BACKSTOP:
-- apps/api already revokes explicitly (admin.updateUserStatus and
-- fraud.service), but users.status is also written by code the P1.1 session
-- may not edit (the frozen apps/web/app/api/admin/users/[id] PATCH route)
-- and by manual SQL. A trigger covers every writer.
--
-- Fires ONLY on the transition INTO the locked state, so ordinary updates
-- (last_seen_at, balance-related touches, reactivation) never delete sessions.
-- Reactivation (suspended -> active) and un-flagging do not restore sessions;
-- the user simply logs in again.
--
-- Limits: it cannot invalidate better-auth's 5-minute cookieCache, and it
-- does not stop a suspended user creating a NEW session by logging in — the
-- account guard (apps/api) refuses that session on every request.
--
-- search_path is pinned, per 0008_fix_function_search_path.sql.
-- Idempotent: safe to run more than once.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0018_revoke_sessions_on_lockout.sql
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_sessions_on_lockout()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.sessions WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_revoke_sessions_on_lockout ON public.users;

CREATE TRIGGER users_revoke_sessions_on_lockout
  AFTER UPDATE OF status, is_fraud_flagged ON public.users
  FOR EACH ROW
  WHEN (
    (NEW.status = 'suspended' AND OLD.status IS DISTINCT FROM 'suspended')
    OR (NEW.is_fraud_flagged AND NOT OLD.is_fraud_flagged)
  )
  EXECUTE FUNCTION public.revoke_sessions_on_lockout();
