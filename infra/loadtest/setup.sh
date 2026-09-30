#!/usr/bin/env bash
# P4.2 - create (or top up) the load-test users on the TARGET database.
#
#   env: DATABASE_URL (staging!), LOADTEST_SEED, LT_USERS (default 90), LT_CREDITS_MICRO (default 50000000 = 50 credits)
#   Users: loadtest-0001@example.invalid ... each with an API key derived from the seed:
#          key(i) = "sk-aip-lt" + first 40 hex chars of HMAC-SHA256(LOADTEST_SEED, "user-" + i)
#   k6 derives the same key, so no key file is ever stored or uploaded.
#
# Credits are written as an admin_credit TRANSACTION plus the balance change, in one DB
# transaction, so infra/scripts/ledger-check.sql stays valid after a load test.
# Idempotent: re-running creates missing users and tops balances back up to the target.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${LOADTEST_SEED:?LOADTEST_SEED is required}"
n="${LT_USERS:-90}"
credits="${LT_CREDITS_MICRO:-50000000}"

# Guard: a load-test database is not the production database. Refuse if it holds real users,
# unless the owner explicitly accepts it (production quiet-window run).
real="$(psql "$DATABASE_URL" -tA -c "select case when to_regclass('public.users') is null then 0 else (select count(*) from public.users where email not like 'loadtest-%@example.invalid') end")"
if [ "$real" -gt 0 ] && [ "${LOADTEST_ALLOW_REAL_USERS:-}" != "1" ]; then
  echo "::error::This database has $real non-load-test user(s). Load-test setup refuses to run here."
  echo "::error::Use a staging database. (Set LOADTEST_ALLOW_REAL_USERS=1 only for a deliberate quiet-window production run.)"
  exit 1
fi

values=""
for i in $(seq 1 "$n"); do
  id="$(printf '%04d' "$i")"
  mac="$(printf 'user-%s' "$i" | openssl dgst -sha256 -hmac "$LOADTEST_SEED" -hex | sed 's/^.* //')"
  key="sk-aip-lt${mac:0:40}"
  hash="$(printf '%s' "$key" | sha256sum | cut -d' ' -f1)"
  values="${values}${values:+,}('loadtest-${id}@example.invalid','${hash}','${key:0:14}')"
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v target="$credits" <<SQL
BEGIN;
INSERT INTO users (email, display_name, status, email_verified, role, api_key_hash, api_key_prefix)
SELECT v.email, 'Load test user', 'active', true, 'user', v.h, v.p
FROM (VALUES ${values}) AS v(email, h, p)
ON CONFLICT (email) DO NOTHING;

INSERT INTO balances (user_id, credits)
SELECT u.id, 0 FROM users u
WHERE u.email LIKE 'loadtest-%@example.invalid'
ON CONFLICT (user_id) DO NOTHING;

-- Top up each load-test user to the target with a real ledger entry.
WITH need AS (
  SELECT b.user_id, (:target)::bigint - b.credits AS amt
  FROM balances b JOIN users u ON u.id = b.user_id
  WHERE u.email LIKE 'loadtest-%@example.invalid' AND b.credits < (:target)::bigint
), upd AS (
  UPDATE balances b SET credits = b.credits + n.amt, updated_at = now()
  FROM need n WHERE b.user_id = n.user_id
  RETURNING b.user_id, b.credits, n.amt
)
INSERT INTO transactions (user_id, type, amount, balance_after, description)
SELECT user_id, 'admin_credit', amt, credits, 'load-test top-up' FROM upd;

SELECT count(*) AS loadtest_users FROM users WHERE email LIKE 'loadtest-%@example.invalid';
COMMIT;
SQL
echo "OK: ${n} load-test users ready"
