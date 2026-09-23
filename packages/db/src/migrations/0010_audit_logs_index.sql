-- ──────────────────────────────────────────────────────────────────────
-- Backend B3 (docs/FRONTEND_REBUILD_PLAN.md §7, "Admin logs + audit").
-- `audit_logs` has had zero indexes beyond its primary key since it was
-- created — fine while nothing queried it except single-row inserts
-- (every admin.* mutation writes one). B3 adds `admin.listAuditLogs`,
-- the first reader, filtering by admin_id and/or action, most-recent
-- first. Same reasoning as 0009_usage_index.sql (F13): index the columns
-- the new filtered/sorted read actually uses, before it ships, not after
-- it's slow.
--
-- Run this with the manual-migration runner (recommended) or by hand:
--   pnpm --filter @ai-platform/db db:migrate:manual
--   -- or --
--   psql $DATABASE_URL < packages/db/src/migrations/0010_audit_logs_index.sql
-- ──────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_date
  ON audit_logs(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_date
  ON audit_logs(action, created_at DESC);
