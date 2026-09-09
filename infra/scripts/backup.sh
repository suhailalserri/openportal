#!/bin/bash
# Manual database backup script
# Usage: bash backup.sh
set -euo pipefail

BACKUP_DIR="/opt/ai-platform/infra/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="backup_${TIMESTAMP}.sql.gz"

source /opt/ai-platform/infra/.env

echo "→ Creating backup: $FILENAME"
docker compose -f /opt/ai-platform/infra/docker-compose.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$BACKUP_DIR/$FILENAME"

SIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
echo "✅ Backup created: $BACKUP_DIR/$FILENAME ($SIZE)"

# Keep only last 30 daily backups
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +30 -delete
echo "✓ Old backups pruned (kept last 30 days)"
