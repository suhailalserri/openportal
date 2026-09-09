# Runbook: Disk Space Warning

**Trigger:** Grafana/cron alert — disk usage > 80%

---

## Step 1 — Assess

```bash
# SSH to server as deploy user
df -h /                              # Overall disk usage
docker system df                     # Docker usage breakdown
du -sh /opt/ai-platform/infra/backups/   # Backup size
du -sh /var/lib/docker/volumes/*/   # Volume sizes
```

## Step 2 — Quick Wins (free space immediately)

```bash
# Remove unused Docker images (keep last 7 days)
docker image prune -a --filter "until=168h"

# Remove stopped containers
docker container prune -f

# Clear system logs older than 7 days
journalctl --vacuum-time=7d

# Remove old backup files (keep last 14 days manually)
find /opt/ai-platform/infra/backups -name "*.gz" -mtime +14 -delete
```

## Step 3 — Database Cleanup

```bash
# Check DB size
docker compose exec postgres psql -U $POSTGRES_USER -c \
  "SELECT pg_size_pretty(pg_database_size('$POSTGRES_DB'));"

# Check largest tables
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
  "SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"

# Manually run pruning job if needed
docker compose exec api pnpm tsx src/jobs/pruneOldLogs.job.ts
```

## Step 4 — Permanent Fix

```bash
# Option A: Resize Hetzner volume (online, no downtime)
# 1. Go to Hetzner console → Volumes → Resize
# 2. Wait 2 min
# 3. sudo resize2fs /dev/disk/by-id/scsi-0HC_Volume_XXXXX

# Option B: Separate PostgreSQL to dedicated server
# → See scalability roadmap in master plan

# Option C: Move backups to object storage
# → Configure backup container to push to MinIO/R2
```

## Thresholds
- 75% → Warning alert, investigate
- 85% → Urgent, act within 4 hours
- 90% → Critical, act immediately
- 95% → EMERGENCY, service may degrade
