#!/usr/bin/env bash
# Installs the PostgreSQL 17 client tools on a GitHub Actions Ubuntu runner.
# pg_dump refuses to dump a server newer than itself, and the runner's default
# client is older than current Supabase Postgres, so use the PGDG repository.
set -euo pipefail
sudo apt-get update -qq
sudo apt-get install -y -qq curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -sSf -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
# shellcheck disable=SC1091
. /etc/os-release
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql-client-17
if [ -n "${GITHUB_PATH:-}" ]; then echo "/usr/lib/postgresql/17/bin" >> "$GITHUB_PATH"; fi
/usr/lib/postgresql/17/bin/pg_dump --version
