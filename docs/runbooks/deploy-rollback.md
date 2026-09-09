# Runbook: Emergency Rollback

**Trigger:** Deploy caused errors, health checks failing, users reporting issues

---

## Step 1 — Assess Severity

```bash
# Check error rate
docker compose logs web --tail=50 | grep -i "error"
docker compose logs api --tail=50 | grep -i "error"

# Check health endpoints
curl https://chat.yourdomain.com/api/health
curl https://api.yourdomain.com/api/status
```

## Step 2 — Rollback Application

```bash
cd /opt/ai-platform

# Find last working commit
git log --oneline -10

# Rollback to previous commit
git revert HEAD --no-commit
# OR checkout specific commit:
git checkout <GOOD_COMMIT_SHA>

# Rebuild and redeploy
cd infra
docker compose build --parallel web api
docker compose up -d --no-deps web api
```

## Step 3 — Rollback Database Migration (if needed)

```bash
# Check migration status
docker compose exec api pnpm db:status

# Rollback last migration
docker compose exec api pnpm db:rollback

# If rollback fails — restore from backup:
bash /opt/ai-platform/infra/scripts/backup-restore.sh backup_TIMESTAMP.sql.gz
```

## Step 4 — Verify Recovery

```bash
# Health check all services
curl -f https://chat.yourdomain.com/api/health
curl -f https://api.yourdomain.com/health

# Test user flow manually:
# 1. Can users log in?
# 2. Can users see their balance?
# 3. Does a chat message work?
# 4. Does redeem code work?
```

## Step 5 — Communicate

Post in team channel:
> "Rolled back to [commit]. Issue was [description]. Working on fix."

## Post-Incident

- Root cause analysis document
- Fix the issue on a branch, test thoroughly before re-deploying
- Consider adding test coverage for the issue
