# Runbook: High Application Error Rate

**Trigger:** Grafana alert `HighErrorRate` (error rate > 5% for 5 minutes) OR
spike in 5xx responses noticed in `/admin/logs` OR user reports piling up.

---

## Step 1 — Confirm It's Real (< 2 minutes)

```bash
# Tail both app containers for the actual errors — don't guess from the alert alone
docker compose logs api --tail=100 | grep -i "error\|exception\|fail"
docker compose logs web --tail=100 | grep -i "error\|exception\|fail"

# Check the error breakdown in Grafana → Operations Overview → "Recent errors" panel
# or query directly if Grafana is unreachable:
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=sum(rate(aip_http_request_duration_seconds_count{status=~"5.."}[5m]))
                    / sum(rate(aip_http_request_duration_seconds_count[5m]))'
```

Read the actual error message and stack trace before doing anything else.
Guessing the cause and acting on the guess is how a P2 becomes a P1.

## Step 2 — Narrow the Cause (ranked by frequency)

**a. Provider degraded, failover misconfigured**
```bash
docker compose logs gateway --tail=50 | grep -i "429\|503\|timeout"
```
If errors are concentrated on one model/provider → this is Phase/runbook
`provider-outage.md`, not a general app issue. Switch to that runbook.

**b. A bad deploy went out**
```bash
# Compare deploy time to error spike onset
docker compose ps --format "table {{.Names}}\t{{.CreatedAt}}"
# Check GitHub Actions deploy history for the timestamp
```
If they line up: **roll back first, investigate after.** Do not debug in
production while users are affected — see `deploy-rollback.md`.

**c. DB connection pool exhausted**
```bash
docker compose exec postgres psql -U $POSTGRES_USER -c \
  "SELECT count(*) FROM pg_stat_activity;"
# Compare against your configured pool max in apps/api/src/config.ts
```
Stopgap: restart the api container to release stuck connections, then
find what's holding connections open (a missing `await`, a long transaction).
```bash
docker compose restart api
```

**d. Redis/Valkey down or unreachable**
```bash
docker compose ps valkey
docker compose exec valkey valkey-cli ping
```
Rate limiting and sessions both depend on this — if it's down, most
requests will fail auth or fraud checks, not just chat requests.

## Step 3 — Mitigate

- If isolated to one route/router (`apps/api/src/routers/*.router.ts`),
  consider whether that feature can be temporarily disabled from
  `/admin/settings` (maintenance mode) while you fix it, rather than
  taking the whole platform down.
- If it's billing-path errors specifically (`aip_balance_deduction_failures_total`
  rising), treat as CRITICAL regardless of overall error percentage —
  this is money, not just UX. Stop and fix before doing anything else.

## Step 4 — Verify Recovery

```bash
# Watch error rate for at least 10 minutes after any fix/rollback
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=sum(rate(aip_http_request_duration_seconds_count{status=~"5.."}[5m]))'
```
Don't declare resolved off a single clean minute — confirm it holds.

## Step 5 — If Rollback Didn't Fix It

It's not the last deploy. Work backward through Step 2's list in order —
infrastructure (disk, DB, Redis, provider) before touching code again.

## Post-Incident

- Log start/end time, root cause, and user-facing impact for the weekly report.
- If root cause was (c) or (d), consider whether a Grafana alert should
  have caught this earlier — update `infra/alerts.yml` thresholds if not.
