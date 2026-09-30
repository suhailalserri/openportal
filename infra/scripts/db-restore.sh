#!/usr/bin/env bash
# P4.1 — restore an encrypted R2 backup into a SCRATCH database and verify the ledger.
#
#   usage: infra/scripts/db-restore.sh <label> [object-key]
#   (no key = the newest object under "<label>/")
#
# Required env: TARGET_DATABASE_URL (the scratch database), BACKUP_PASSPHRASE,
#               R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET.
# Optional env: PRODUCTION_DATABASE_URLS (space-separated; refuse if TARGET matches one),
#               ALLOW_NONEMPTY_TARGET=1 (restore over a target that already has users).
#
# This script only ever WRITES to TARGET_DATABASE_URL and uses --clean, so it must
# never point at production. Guards below refuse the obvious mistakes.
set -euo pipefail

label="${1:?label required}"
key="${2:-}"

need() { if [ -z "${!1:-}" ]; then echo "::error::$1 is not set"; exit 1; fi; }
need TARGET_DATABASE_URL; need BACKUP_PASSPHRASE; need R2_ACCOUNT_ID; need R2_ACCESS_KEY_ID; need R2_SECRET_ACCESS_KEY; need R2_BACKUP_BUCKET

for prod in ${PRODUCTION_DATABASE_URLS:-}; do
  if [ "$prod" = "$TARGET_DATABASE_URL" ]; then echo "::error::TARGET_DATABASE_URL equals a production URL. Refusing."; exit 1; fi
done
existing="$(psql "$TARGET_DATABASE_URL" -tA -c "select case when to_regclass('public.users') is null then 0 else (select count(*) from public.users) end")"
if [ "$existing" -gt 0 ] && [ "${ALLOW_NONEMPTY_TARGET:-}" != "1" ]; then
  echo "::error::Target already has $existing user row(s); it does not look like a scratch database. Refusing."
  exit 1
fi

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
export AWS_REQUEST_CHECKSUM_CALCULATION="when_required"
export AWS_RESPONSE_CHECKSUM_VALIDATION="when_required"
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
t0="$(date +%s)"

if [ -z "$key" ]; then
  key="$(aws s3api list-objects-v2 --bucket "$R2_BACKUP_BUCKET" --prefix "${label}/" --endpoint-url "$endpoint" \
        --query 'sort_by(Contents, &LastModified)[-1].Key' --output text)"
  if [ -z "$key" ] || [ "$key" = "None" ]; then echo "::error::No backup objects under ${label}/"; exit 1; fi
fi
echo "== using $key"

aws s3 cp "s3://${R2_BACKUP_BUCKET}/${key}" "$work/dump.enc" --endpoint-url "$endpoint" --only-show-errors
t1="$(date +%s)"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$work/dump.enc" -out "$work/dump.pgdump" -pass env:BACKUP_PASSPHRASE
t2="$(date +%s)"

echo "== pg_restore"
# --clean --if-exists so it works on both an empty container and a fresh Supabase project
# (whose public schema already exists). Non-fatal warnings are printed; we judge by the checks below.
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$TARGET_DATABASE_URL" "$work/dump.pgdump" || echo "pg_restore reported warnings (see above); verifying the data instead"
t3="$(date +%s)"

echo "== ledger check on the restored copy"
out="$(psql "$TARGET_DATABASE_URL" -tA -F '|' -f "$(dirname "$0")/ledger-check.sql")"
echo "$out"
t4="$(date +%s)"

summary="download $((t1-t0))s, decrypt $((t2-t1))s, restore $((t3-t2))s, verify $((t4-t3))s, TOTAL $((t4-t0))s"
echo "TIMINGS: $summary"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Restore drill: \`${key}\`"
    echo "Timings: ${summary}"
    echo '```'
    echo "$out"
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi

if echo "$out" | grep -q '|f$'; then
  echo "::error::Ledger check FAILED on the restored copy"
  exit 1
fi
echo "OK: restored and ledger verified"
