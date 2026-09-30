-- ──────────────────────────────────────────────────────────────────────
-- P3.6 — backfill provider_prices from the wholesale cost on `models`.
--
-- WHY: dashboard.service.ts prices every usage_debit transaction from
-- provider_prices, but nothing ever wrote to that table, so the admin
-- dashboard showed cost = $0 and margin ~100%. From this release,
-- models.publish keeps the table current; this file seeds the current price
-- for models that already have one.
--
-- UNIT: provider_prices is USD per 1K tokens (the dashboard SQL divides token
-- counts by 1000). models.wholesale_cost_*_per_m is per 1M, hence / 1000.
--
-- HISTORY IS AN APPROXIMATION: the true past prices are unknown, so the seeded
-- row is effective from 2000-01-01 and values ALL past usage at TODAY's
-- wholesale cost. Dashboard cost for past periods is therefore an estimate;
-- from the moment a price changes through the admin, history is exact.
--
-- SCOPE: only models with a non-zero wholesale cost and an id of at most 100
-- characters (provider_prices.model_id is varchar(100); models.id is 150).
-- Models that already have a current row are left alone. Idempotent.
--
-- Execute with: psql $DATABASE_URL < packages/db/src/migrations/0020_provider_prices_backfill.sql
-- (or paste it into the Supabase SQL editor). Safe before or after the deploy.
-- ──────────────────────────────────────────────────────────────────────

INSERT INTO provider_prices (model_id, provider, input_price_usd, output_price_usd, effective_from, effective_to)
SELECT m.id,
       left(m.provider, 50),
       round(m.wholesale_cost_input_per_m  / 1000, 8),
       round(m.wholesale_cost_output_per_m / 1000, 8),
       timestamp '2000-01-01 00:00:00',
       NULL
FROM models m
WHERE length(m.id) <= 100
  AND (m.wholesale_cost_input_per_m > 0 OR m.wholesale_cost_output_per_m > 0)
  AND NOT EXISTS (
    SELECT 1 FROM provider_prices p
    WHERE p.model_id = m.id AND p.effective_to IS NULL
  );
