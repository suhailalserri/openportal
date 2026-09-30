# Alerting runbook (P2.2, closes G4)

Everything goes to ONE Telegram chat (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`). Prometheus/Alertmanager no longer exist (ADR-011); `infra/alerts.yml` was converted into the table below and deleted.

## What alerts, and from where

| Signal | Old rule (alerts.yml) | Now | Where it lives |
|---|---|---|---|
| A provider's upstream calls fail >50% (>=5 calls, 2 min) | ProviderAllChannelsFailed | Telegram CRITICAL, max 1 per 15 min per provider | app: `monitoring/alert-rules.ts` |
| >5 failed credit deductions in 1 min | BalanceDeductionFailing | Telegram CRITICAL | app: `alert-rules.ts` via `balance.service` |
| Fraud auto-suspend | (new) | Telegram CRITICAL per user+type, 1 per hour | app: `fraud.service.ts` |
| Billing lock store (Redis) unreachable | (P1.2) | Telegram CRITICAL, throttled 5 min | app: `billing-lock.service.ts` |
| Failed-job burst (>=5 in 5 min per queue) | (P2.3) | Telegram WARNING | app: `jobs/job-failures.ts` |
| Model sold below cost / margin under 40% / unpriced / provider price drift | (new, P3.6) | Telegram CRITICAL or WARNING: at once on an admin price save, and a daily 04:00 UTC digest | app: `services/price-guard*.ts`, runbook `PRICE_GUARD.md` |
| Redis policy != noeviction / memory >= 70% | RedisMemoryHigh | Telegram CRITICAL / WARNING | app: `jobs/redis-health.ts` |
| Any new error type / error spike | HighErrorRate | Telegram via Sentry rule (below) | Sentry -> `/internal/sentry-alert` |
| web / api / gateway down | ExporterDown | Telegram via uptime monitor (below) | UptimeRobot / Better Stack |
| Render deploy failed, Supabase limits | (new) | Telegram via forwarding (below) | Render / Vercel / Supabase |
| Disk, Postgres connections, exporters | DiskSpace*, PostgresConnectionsExhausted, ExporterDown | DROPPED: hosts are managed (Render/Supabase); Supabase emails on limits | - |
| Provider P95 latency | ProviderHighLatency | DROPPED: no tracing (P2.1 is errors only). Revisit after launch | - |
| Active users == 0 | ActiveUsersDroppedToZero | DROPPED: the uptime monitors cover "unreachable"; quiet hours caused false alarms | - |
| Fraud critical spike | FraudCriticalEventSpike | Covered: every critical fraud event alerts individually | - |

Delivery path: `queueAlert()` puts the message on the BullMQ `alerts` queue. If Redis is down or slow (>3 s) it sends straight to Telegram instead, so an outage of Redis itself is still reported. Text is plain (no Markdown), redacted (emails, tokens, keys) and capped.

## Owner setup (cannot be done from code)

### 1. Render (api) env
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (already used by the old worker).
- `SENTRY_WEBHOOK_TOKEN` = a random string of 24+ chars (e.g. `openssl rand -hex 24`). Without it `/internal/sentry-alert` answers 404.
- Redeploy.

### 2. Sentry -> Telegram (UI labels may differ slightly by Sentry version)
1. Project -> Settings -> Integrations / Legacy Integrations -> **WebHooks**: enable, add callback URL
   `https://<api-host>/internal/sentry-alert?token=<SENTRY_WEBHOOK_TOKEN>`.
   (If your plan hides the legacy plugin: create an Internal Integration with that webhook URL and pick it as the alert action.)
2. Alerts -> Create Alert -> **Issue alert**, two rules, action "Send a notification via WebHooks":
   - "New error type": When *a new issue is created*, all environments `production`.
   - "Error spike": When *an issue is seen more than 20 times in 5 minutes*, rate-limit the action to once per 30 minutes.
3. Use the "Send test notification" button on the rule. A Telegram message should arrive.

### 3. Uptime monitors (UptimeRobot or Better Stack free tier), every 1-5 min, alert contact = Telegram
| Monitor | URL | Expect |
|---|---|---|
| web | `https://<web>/api/health` | 200 |
| api | `https://<api>/health` | 200 |
| gateway (synthetic) | `https://<api>/health/gateway` | 200 (503 = gateway down) |
Note: on Render **Free** the api spins down after 15 min idle, so `/health` will flap (L17). Move api and gateway to a paid instance type before enabling paging.

### 4. Deploy / infrastructure alerts
- Render: Workspace -> Notifications -> enable deploy-failed notifications. Render sends email/Slack, so forward the email to Telegram (any email-to-Telegram bot) or add a Render Webhook to an automation tool that posts to your bot.
- Vercel: Project -> Settings -> Notifications (deployment failed) - same forwarding.
- Supabase (both projects): Organization -> notification/billing emails on for usage limits, forward likewise.
None of these is code; the drills below prove each one.

## Drills (do each once, then tick LAUNCH_CHECKLIST "Telegram receives ...")
Each must produce a Telegram message within the stated window.

| Drill | How | Expect within |
|---|---|---|
| App alert | Render shell / one-off: call the api with a bad provider key until >=5 errors, or temporarily lower nothing; simplest: `curl` `/health/gateway` after pointing `GATEWAY_URL` at a dead host in a scratch deploy | 2 min |
| Redis-down fallback | Set `REDIS_URL` on a scratch deploy to an unreachable host, trigger any alert (e.g. the fraud auto-suspend on a test user) | 10 s (direct send) |
| Sentry relay | Sentry rule "Send test notification", then `POST /internal/sentry-test` (Bearer INTERNAL_SERVICE_TOKEN) | 1 min |
| Uptime | Pause/kill the api (or point the monitor at a 404 URL) | monitor interval + 1 min |
| Failed job | see `REDIS_POLICY.md` | 5 min |
| Deploy failed | Push a commit that breaks the build to a preview/branch | provider-dependent |
| Bad token | `curl -X POST "https://<api>/internal/sentry-alert?token=wrong"` | must be **401**, no Telegram |
