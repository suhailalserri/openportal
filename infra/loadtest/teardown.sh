#!/usr/bin/env bash
# P4.2 - remove ONLY the load-test users (email loadtest-%@example.invalid) and their rows.
#   env: DATABASE_URL
# transactions.user_id has no ON DELETE CASCADE, so they are deleted first. Removing a user's
# transactions together with their balance keeps the ledger invariant intact.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE TEMP TABLE lt ON COMMIT DROP AS SELECT id FROM users WHERE email LIKE 'loadtest-%@example.invalid';
DELETE FROM fraud_events WHERE user_id IN (SELECT id FROM lt);
DELETE FROM transactions WHERE user_id IN (SELECT id FROM lt);
DELETE FROM conversations WHERE user_id IN (SELECT id FROM lt);   -- messages cascade
DELETE FROM balances WHERE user_id IN (SELECT id FROM lt);
DELETE FROM sessions WHERE user_id IN (SELECT id FROM lt);
DELETE FROM users WHERE id IN (SELECT id FROM lt);
SELECT count(*) AS remaining_loadtest_users FROM users WHERE email LIKE 'loadtest-%@example.invalid';
COMMIT;
SQL
