-- ──────────────────────────────────────────────────────────────────────
-- Backend B2 (docs/FRONTEND_REBUILD_PLAN.md §7, "User usage + index").
-- Supports usage.service.ts's usageSummary/usageTimeseries/usageByModel/
-- listUsage queries, which all filter on `type = 'usage_debit'` before
-- (or in addition to) filtering by user_id. idx_transactions_user_date
-- (0001_constraints.sql) already covers the plain "this user's history"
-- query (getTransactions); this index is for anything that scans/filters
-- by type first — most directly, the admin-facing B3 aggregate views
-- planned right after this one, and any future cross-user usage report.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0009_usage_index.sql
-- ──────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_transactions_type_date
  ON transactions(type, created_at DESC);
