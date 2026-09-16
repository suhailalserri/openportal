-- ──────────────────────────────────────────────────────────────────────
-- Fixes Supabase linter WARN: function_search_path_mutable on
-- public.update_updated_at_column.
--
-- Without a pinned search_path, an unqualified object reference inside a
-- function resolves against whatever search_path is active when it runs
-- — which a caller can influence. This function currently only touches
-- NEW.updated_at (no unqualified table/type lookups), so there's no live
-- exploit today, but pinning it is the correct default: it means this
-- stays safe even if the function is later changed to SECURITY DEFINER
-- or gains an unqualified reference, without anyone having to remember
-- this rule at that point.
--
-- CREATE OR REPLACE preserves the existing triggers that call this
-- function (users_updated_at, conversations_updated_at, etc.) — no need
-- to recreate them.
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Verification query — run after applying ─────────────────────────────
-- proconfig should show {search_path=public,pg_temp}, not null.
--
-- SELECT proname, proconfig
-- FROM pg_proc
-- WHERE proname = 'update_updated_at_column';
