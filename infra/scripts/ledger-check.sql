-- ──────────────────────────────────────────────────────────────────────
-- P4.1 — ledger verification (read-only, one statement, safe on production).
--
-- Output: one row per check -> check_name | value | ok
--   ok = false means the ledger is inconsistent. Rows marked "info" are always ok.
--
-- INVARIANT: `balances.credits` is only ever changed together with a signed
-- `transactions.amount` row in the same DB transaction (balance.service.ts:
-- deductCreditsAtomic writes -amount, creditBalance writes +amount; the payment
-- webhook does the same). Every balance row starts at 0 (SIGNUP_BONUS is 0), so
--     credits(user) = SUM(transactions.amount for that user)
-- must hold per user, and therefore in total. Rows seeded by hand (seed.ts, or
-- createTestUser with initial credits) have no transaction and WILL show up here;
-- that is expected in dev and must never happen in production.
--
-- Run:  psql "$DATABASE_URL" -tA -F '|' -f infra/scripts/ledger-check.sql
--       (any line ending in |f is a failure)
-- ──────────────────────────────────────────────────────────────────────
WITH per_user AS (
  SELECT b.user_id,
         b.credits,
         COALESCE(SUM(t.amount), 0)::bigint AS tx_sum
  FROM balances b
  LEFT JOIN transactions t ON t.user_id = b.user_id
  GROUP BY b.user_id, b.credits
)
SELECT 'users_count'::text AS check_name,
       (SELECT count(*) FROM users)::text AS value,
       true AS ok
UNION ALL
SELECT 'balances_sum_credits', COALESCE(SUM(credits), 0)::text, true FROM per_user
UNION ALL
SELECT 'transactions_sum_amount', COALESCE(SUM(tx_sum), 0)::text, true FROM per_user
UNION ALL
SELECT 'ledger_total_matches',
       (COALESCE(SUM(credits), 0) - COALESCE(SUM(tx_sum), 0))::text,
       COALESCE(SUM(credits), 0) = COALESCE(SUM(tx_sum), 0)
FROM per_user
UNION ALL
SELECT 'users_where_credits_differ_from_tx_sum', count(*)::text, count(*) = 0
FROM per_user WHERE credits <> tx_sum
UNION ALL
SELECT 'negative_balances', count(*)::text, count(*) = 0
FROM balances WHERE credits < 0
UNION ALL
SELECT 'info_transactions_without_balance_row', count(*)::text, true
FROM transactions t
WHERE NOT EXISTS (SELECT 1 FROM balances b WHERE b.user_id = t.user_id)
UNION ALL
SELECT 'info_latest_transaction_at', COALESCE(max(created_at)::text, 'none'), true
FROM transactions;
