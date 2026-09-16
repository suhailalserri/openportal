-- ──────────────────────────────────────────────────────────────────────
-- Model picker: real "speed" data. The picker previously had no latency
-- column to read from at all (provider was already a column but wasn't
-- being returned by trpc.models.list — fixed in code, not schema).
-- avg_response_time_ms is populated by syncModelsFromGateway from New
-- API's own channel health check (/api/channel response_time/test_time),
-- averaged across enabled channels currently serving each model — the
-- exact same data source the admin Channels page already renders per
-- channel. Nullable: no fabricated default, stays null until a real
-- measurement exists.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0006_model_latency.sql
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE models ADD COLUMN IF NOT EXISTS avg_response_time_ms integer;
