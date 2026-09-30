#!/usr/bin/env bash
# P4.1 — one encrypted logical backup of one database, pushed to Cloudflare R2.
#
#   usage: infra/scripts/db-backup.sh <label> <NAME_OF_ENV_VAR_HOLDING_THE_DB_URL>
#   e.g.   infra/scripts/db-backup.sh app APP_DATABASE_URL
#
# Required env: BACKUP_PASSPHRASE, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
#               R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET, and the DB URL variable.
# The DB URL must be a direct or session-mode pooler string (port 5432), NOT the
# 6543 transaction pooler: pg_dump needs a session.
set -euo pipefail

label="${1:?label required}"
url_var="${2:?db url variable name required}"
db_url="${!url_var:-}"

need() { if [ -z "${!1:-}" ]; then echo "::error::$1 is not set (see docs/runbooks/backup-restore-drill.md, section 2)"; exit 1; fi; }
need BACKUP_PASSPHRASE; need R2_ACCOUNT_ID; need R2_ACCESS_KEY_ID; need R2_SECRET_ACCESS_KEY; need R2_BACKUP_BUCKET
if [ -z "$db_url" ]; then echo "::error::$url_var is not set"; exit 1; fi

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
# R2 rejects the newer default AWS CLI checksum headers.
export AWS_REQUEST_CHECKSUM_CALCULATION="when_required"
export AWS_RESPONSE_CHECKSUM_VALIDATION="when_required"
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
ts="$(date -u +%Y%m%dT%H%M%SZ)"
key="${label}/$(date -u +%Y/%m)/ai-platform-${label}-${ts}.pgdump.enc"

schemas=(--schema=public)
has_drizzle="$(psql "$db_url" -tA -c "select count(*) from pg_namespace where nspname = 'drizzle'")"
if [ "$has_drizzle" = "1" ]; then schemas+=(--schema=drizzle); fi

started="$(date +%s)"
echo "== pg_dump ($label)"
pg_dump "$db_url" --format=custom --compress=9 --no-owner --no-privileges "${schemas[@]}" --file "$work/dump.pgdump"
pg_restore --list "$work/dump.pgdump" > /dev/null   # catches a truncated/corrupt archive
plain_bytes="$(stat -c %s "$work/dump.pgdump")"

echo "== encrypt (AES-256-CBC, PBKDF2)"
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in "$work/dump.pgdump" -out "$work/dump.enc" -pass env:BACKUP_PASSPHRASE
enc_bytes="$(stat -c %s "$work/dump.enc")"
sha="$(sha256sum "$work/dump.enc" | cut -d' ' -f1)"

echo "== upload s3://$R2_BACKUP_BUCKET/$key"
aws s3 cp "$work/dump.enc" "s3://${R2_BACKUP_BUCKET}/${key}" --endpoint-url "$endpoint" --metadata "sha256=${sha}" --only-show-errors

remote_bytes="$(aws s3api head-object --bucket "$R2_BACKUP_BUCKET" --key "$key" --endpoint-url "$endpoint" --query ContentLength --output text)"
if [ "$remote_bytes" != "$enc_bytes" ]; then
  echo "::error::Uploaded object is $remote_bytes bytes, expected $enc_bytes"
  exit 1
fi

elapsed=$(( $(date +%s) - started ))
echo "OK $label: $key (dump ${plain_bytes} B, encrypted ${enc_bytes} B, sha256 ${sha}, ${elapsed}s)"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "- **${label}**: \`${key}\` — ${enc_bytes} bytes encrypted, ${elapsed}s, sha256 \`${sha}\`" >> "$GITHUB_STEP_SUMMARY"
fi
