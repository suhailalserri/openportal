-- ──────────────────────────────────────────────────────────────────────
-- Admin-chosen icon override for the models table. `provider` (already a
-- column) is system-managed — syncModelsFromGateway overwrites it from
-- New API's channel `type` field on every sync — so it's not safe ground
-- for an admin's manual "actually show the Mistral logo for this one"
-- choice. This column is untouched by the sync job; it's only ever
-- written from the admin models form. NULL means "auto-detect the icon
-- from `provider`" (see apps/web/components/icons/provider-icon.tsx).
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0012_model_provider_icon.sql
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE models ADD COLUMN IF NOT EXISTS provider_icon_key varchar(50);
