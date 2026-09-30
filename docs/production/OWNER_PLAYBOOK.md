# Owner playbook: from NO-GO to launch

Companion to `docs/production/LAUNCH_GATE.md`. One ordered list of everything only you can do,
merged from the runbooks (linked at each step; they stay the source of truth).
Written for a phone. Click paths are from memory of each vendor's UI and may differ slightly:
if a label is not where I say, look for the closest one.

**Rules for the whole playbook**
- Never paste a secret into chat, a PR or a log. Send me *evidence* (screenshots, SQL output, run links), not keys.
- Do the steps in order. Steps 1 to 3 change what later drills mean.
- After each step, keep one piece of evidence. The gate re-walk ticks a line only on evidence.
- Commands marked `curl` need a terminal. On a phone options are a free HTTP-client app, or a GitHub
  Codespace terminal. GET requests can be pasted in a browser. (Suggestion, not tested.)

Placeholders: `<api>` = your Render api URL, `<web>` = your Vercel URL, `<gateway>` = the gateway URL.

---

## 1. Hosting plans (blocker B1)  ~30 min + cost

Why first: Upstash Free (500K commands/month) can take paid chat down; Vercel Hobby forbids commercial use;
Render Free sleeps after 15 min; Supabase Free has no downloadable backups and pauses when idle.

| Service | Do | Evidence |
|---|---|---|
| Vercel | Team/Account settings > Billing > upgrade to **Pro** (L16) | Screenshot of the plan name |
| Upstash | Database > upgrade to **Fixed** (from $10/mo) or Pay-as-you-go (L15) | Screenshot of the plan |
| Render (api) | Service > Settings > Instance Type > pick a **paid** type (L17) | Screenshot showing type |
| Render (gateway) | Same for `openportal-gateway` | Screenshot |
| Supabase (app) | Organization > Billing > **Pro** for the app project (L18) | Screenshot |
| Supabase (gateway) | Same for the gateway project | Screenshot |

Then record in `docs/architecture/decisions.md` (ADR-011 table): plan, region, backup. Also note in the
ADR that Redis is TLS + password (not a private network) and that the gateway is public but token-protected
(it returned 401 on `/v1/models` on 2026-09-29). Set ADR-011 Status to **Accepted** only when no ⬜ remains
(blocker B10). Your copy may already say Accepted; if so send it to me, the repo zip I read says DRAFT.

Also on Render (api): decide the instance count. L6 assumes 2+ replicas; if you run 1, write that in the ADR.

---

## 2. Apply migrations 0017 to 0020 to production (blocker B2)  ~15 min

**Order matters: apply 0019 before the web/api deploy that uses it.** If web deploys first, every
`/api/auth/*` call errors (a login outage).

Safest method (touches exactly four files, all re-runnable):
1. Supabase (app project) > SQL Editor > New query.
2. From the repo open `packages/db/src/migrations/` and paste, run, one file at a time, in this order:
   `0017_platform_config_rls.sql`, `0018_revoke_sessions_on_lockout.sql`,
   `0019_auth_rate_limit.sql`, `0020_provider_prices_backfill.sql`.
   Each should say Success. I read them: all use `IF EXISTS` / `IF NOT EXISTS` / `CREATE OR REPLACE` /
   `NOT EXISTS`, so a second run does nothing.
3. Verify:
   ```sql
   select count(*) from rate_limit;                       -- 0, no error
   select tgname from pg_trigger where tgname = 'users_revoke_sessions_on_lockout';  -- 1 row
   select count(*) from provider_prices;                  -- > 0 if you have priced models
   ```
Alternative: Actions > **DB Operations** > target `production`, task `constraints`. It runs every raw SQL
file 0001 to 0020 in a loop. Do **not** pick `reset`, `reset-and-migrate-all`, `seed` or `all` on production.
I did not verify that every older file is safe to re-run, which is why I prefer the four-file method.

**RLS check, on BOTH Supabase projects** (SQL Editor). Expect zero rows:
```sql
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
```
- App project: any row listed is a gap; send me the names.
- Gateway project: New API's own tables will probably be listed. Do not enable RLS on them blindly
  (it may break the gateway; not verified). Safer: Project Settings > API (Data API) > turn the Data API
  **off** for that project, then note it in ADR-011. Send me the list first if unsure.

Evidence: screenshot of each query result.

---

## 3. Seed backdoor check (blocker B3)  ~5 min  (`SECURITY_SWEEP.md` step 1)

In the app project SQL Editor:
```sql
select id, email, role, created_at from users where email like '%@localhost.dev';
```
- **0 rows:** done.
- **Any row:** log in with your real admin, enrol 2FA, then delete or disable those rows or change their
  passwords **before anything else**. If you use `admin@localhost.dev` as your real admin, create a proper
  account first and retire it.

---

## 4. Deploy the code (PR first)

1. Open a PR with the current repo, wait for CI green: `Type-check & Lint`, `API Tests (Testcontainers)`,
   `API Docker Image`, `Web Build (next build)`. (Render and Vercel build `main` without waiting for CI,
   so do not push straight to `main`.)
2. Render (api) > Settings > Deploy: **Pre-Deploy Command must be empty**; Health Check Path `/health`;
   **Shutdown delay 120 seconds** (`DEPLOY_SHUTDOWN.md`); Auto-Deploy *After CI Checks Pass*.
3. Merge. Confirm `<api>/health` is 200 and `<api>/ready` is 200 (`ready` shows DB and Redis ok).
4. Sign in on the site, then try 6 wrong passwords on a throwaway account; the 6th should give 429.
   Then `select key, count from rate_limit order by last_request desc limit 5;` shows rows.

---

## 5. Env vars to set (Render api unless noted)  ~20 min

Generate secrets with `openssl rand -hex 32` (or any password manager, 32+ chars).

| Variable | Where | Purpose |
|---|---|---|
| `SENTRY_DSN` | Render | api error tracking (P2.1) |
| `SENTRY_WEBHOOK_TOKEN` (24+ chars) | Render | Sentry to Telegram relay |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Render | alerts |
| `METRICS_TOKEN` (24+ chars) | Render | closes the public `/metrics` (N9) |
| `ADMIN_REQUIRE_2FA=true` | **Render AND Vercel** | admin 2FA (do after step 6) |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel Production | Turnstile (off without the secret) |
| `DATABASE_POOL_MAX` | Render | default is 1; decide with the load test |
| `TRUSTED_PROXY_HOPS` | Render | see step 7 |

Redeploy after changes (Vercel applies env changes only to a new deployment).

Check `/metrics`:
- `curl -i <api>/metrics` returns **401** (404 if the token is unset).
- With `-H "Authorization: Bearer $METRICS_TOKEN"` it returns 200.

Remove any stray `SUPABASE_SERVICE_ROLE_KEY` from Render, Vercel and GitHub secrets (this repo does not use it).

---

## 6. Admin 2FA (`SECURITY_SWEEP.md` steps 3 and 4)

1. Every admin: Settings > Security > enrol an authenticator app.
2. Verify in SQL: `select email, role, two_factor_enabled from users where role in ('admin','superadmin');`
   Every row must be `true`. If one stays `false` after enrolling, stop and send me the row.
3. Only then set `ADMIN_REQUIRE_2FA=true` on **both** Render and Vercel, redeploy both, open `/admin`.
   Locked out? Unset the variable on both and redeploy. Do not edit `two_factor_enabled` by hand.

Turnstile test with a throwaway address:
`curl -i -X POST <web>/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: <web>' -d '{"email":"you+t@example.com","password":"Aa1aaaaa","name":"t"}'`
Expect 4xx. A 200 means Turnstile is off: delete that user and fix the secret.

---

## 7. Client-IP check (P1.3 leftover, from Session 12)

Goal: learn what IP the api really sees. Call the api directly from a network that is not Vercel, with
logging of `request.ip`, `cf-connecting-ip`, `x-forwarded-for` (ask me for a one-line temporary log if you
want it; no repo change was made for this). Set `TRUSTED_PROXY_HOPS` to what you see (likely 2 if Cloudflare
and Render's proxy are both in front). If skipped, direct callers may share one identity: coarse but not forgeable.

---

## 8. Drills (blockers B4, B5, B6)

### 8a. Redis (`REDIS_POLICY.md`)
1. Upstash > database > Details/Configuration: **Eviction OFF** (= `noeviction`). Screenshot.
2. Upstash: set a usage/memory notification at about 70%.
3. Failing-job drill: cause a job to fail on purpose (the runbook suggests pointing `RESEND` key at garbage
   and registering a user). Expect: a Sentry issue tagged `queue:email`; `aip_job_failures_total{queue="email"}`
   rising on `/metrics` (needs the token); a Telegram message after 5 failures in 5 minutes.
   Put the Resend key back afterwards.

### 8b. Alerts and Sentry (`ALERTING.md`)
1. Sentry > Alerts: webhook `https://<api>/internal/sentry-alert?token=<SENTRY_WEBHOOK_TOKEN>`; two issue
   rules ("new issue created" in `production`; "seen more than 20 times in 5 min", once per 30 min).
   Use **Send test notification**: Telegram should receive it.
2. Sentry smoke test: `curl -X POST <api>/internal/sentry-test -H "Authorization: Bearer <INTERNAL_SERVICE_TOKEN>"`.
   The event must appear in Sentry within a minute.
3. Bad token must be refused: `curl -i -X POST "<api>/internal/sentry-alert?token=wrong"` gives **401**, no Telegram.
4. Uptime monitors (UptimeRobot or Better Stack free tier), alert contact = Telegram:
   web `<web>/api/health`, api `<api>/ready` (per `DEPLOY_SHUTDOWN.md`), gateway check `<api>/health/gateway`.
   Drill: pause one monitor's target, expect a message within interval + 1 min.
5. Render and Vercel deploy-failed notifications forwarded to Telegram (email-to-Telegram bot or webhook).
   Drill: push a build-breaking commit to a **branch**, expect a message.
6. Redis-down fallback drill: on a scratch deploy set `REDIS_URL` to an unreachable host and trigger an alert;
   Telegram should still get it within about 10 s.

### 8c. Mid-stream deploy (`DEPLOY_SHUTDOWN.md`)  (can be combined with step 10)
1. Start a chat asking for a very long answer; keep it streaming.
2. Render > Manual Deploy (or Restart) while it streams.
3. Expect: the answer completes, or is cut at 90 s and saved as partial. Logs show `[shutdown] SIGTERM: draining`
   then `[shutdown] complete`, and no `hard exit`.
4. Ledger: exactly one usage row for that request:
   ```sql
   select m.gateway_request_id, m.is_partial, count(t.*) as ledger_rows
   from messages m left join transactions t on t.request_id = m.gateway_request_id
   where m.role='assistant' and m.created_at > now() - interval '30 minutes'
   group by 1,2 order by max(m.created_at) desc;
   ```
   `ledger_rows` must be 1 for the interrupted chat. (Column names are from memory in the runbook; adjust.)

### 8d. Price guard (`PRICE_GUARD.md`)
1. Run `price-audit` once (`pnpm --filter @ai-platform/db exec tsx ../../infra/scripts/price-audit.ts`, needs
   `DATABASE_URL`; from a Codespace). Fix what it lists.
2. Admin > Models: set a test model's markup to **0.5**, save. A CRITICAL Telegram message should arrive in
   seconds. Set the markup back.

### 8e. Rate limit smoke test (P3.1)
25 `/chat` requests within a minute: 20 pass, then 429 with `Retry-After`. Then chat steadily for 12 minutes:
no 429. Check `aip_rate_limit_fallback_total` stays 0.

### 8f. Secret rotation rehearsal (`secret-rotation.md`)
Do the `INTERNAL_SERVICE_TOKEN` zero-401 procedure once (it is on production because no staging exists yet;
if you build staging in step 10, rehearse there). Summary: 25 chats OK; Render add
`INTERNAL_SERVICE_TOKEN_PREVIOUS`=OLD and `INTERNAL_SERVICE_TOKEN`=NEW; check both accepted by
`/internal/sentry-test` and a fake token gives 401; set NEW on Vercel and redeploy; chat for a few minutes;
delete `_PREVIOUS`; confirm OLD now gives 401; 25 chats again. Log one line in `SESSION_LOG.md` (no values).

---

## 9. Backup and restore drill (blocker B7)  (`backup-restore-drill.md`)

1. Cloudflare R2: create a **private** bucket (for example `ai-platform-backups`); create an API token with
   Object Read & Write limited to it; note the Account ID; add a lifecycle rule deleting objects after 30 days.
2. GitHub > Settings > Secrets and variables > Actions, add: `BACKUP_DATABASE_URL` (Supabase **session mode,
   port 5432**, not 6543), optional `GATEWAY_DATABASE_URL` (same rule), `BACKUP_PASSPHRASE` (long random;
   **keep a copy in your password manager, outside GitHub**), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
3. Actions > **DB Backup** > Run workflow. Expect green and an object key in the summary; confirm the object in R2.
4. Actions > **DB Restore Drill** > Run with target `ci-container`. Expect green with ledger check + timings.
5. Real drill: create a scratch Supabase project (empty), put its session-mode string in `SCRATCH_DATABASE_URL`.
   Note the clock time. Run **DB Restore Drill** with target `scratch-supabase`, key empty.
6. Open the run summary: all ledger checks `ok = t`; compare `users_count`, `balances_sum_credits`,
   `info_latest_transaction_at` with production (run `infra/scripts/ledger-check.sql` there).
7. **Write the RTO** in `backup-restore-drill.md` section 6 (summary `TOTAL` plus your own start-to-finish time),
   plus your Supabase plan, retention and PITR decision. Delete the scratch project.
8. Check R2 for a fresh object each week for the first month (scheduled runs can pause).

---

## 10. Load test (blocker B8)  (`LOAD_TEST.md`)  ~2 hours, real provider cost

1. Staging Supabase project (session-mode string), a separate Upstash database with `noeviction`, and a second
   Render web service from the same Dockerfile with its own env values (fresh `BETTER_AUTH_SECRET`,
   `INTERNAL_SERVICE_TOKEN`, `CODE_SALT`, `METRICS_TOKEN`). Match production instance type and
   `DATABASE_POOL_MAX`. Never share production Redis. If staging uses the production gateway, the test costs real money.
2. GitHub secrets: `LOADTEST_BASE_URL`, `LOADTEST_DATABASE_URL`, `LOADTEST_SEED` (long random),
   optional `LOADTEST_METRICS_TOKEN`.
3. Actions > **DB Operations**: target `staging`, task `migrate`, then `constraints`, then `seed-models`.
   Never `seed` on staging.
4. In the staging SQL editor publish one cheap model:
   `update models set status='published', is_available=true where id='<MODEL_ID>';` then confirm price columns are non-zero.
5. Smoke test: `<staging>/health` and `<staging>/ready` return 200.
6. Actions > **Load Test**: `model`=cheap id, `duration`=6m, `stream_vus`=60, `teardown`=off.
7. About **2 minutes in**, Render (staging) > Manual Deploy; write down when you tapped it and when it went live.
8. Read the run summary against the pass list: no `server_500`/`unexpected_status`; `lock_409_ok_body > 0`;
   no `|f` in reconciliation or ledger blocks; no pool exhaustion (Render logs, Supabase connections graph);
   Redis memory plateaus (Upstash); errors only inside deploy window + grace.
9. Fill `LOAD_TEST.md` section 7. Rerun with `teardown` on. Check the provider dashboard for cost.

---

## 11. GitHub settings (blocker B9)  ~15 min  (`SECURITY_SWEEP.md` steps 7, 8)

1. Settings > Code security (Advanced Security): enable **Secret scanning** and **Push protection**, **Dependabot
   alerts** and **Dependabot security updates**.
2. Settings > Branches > add a rule/ruleset for `main`: require a pull request; require status checks
   `API Tests (Testcontainers)`, `Web Build (next build)`, `Type-check & Lint`, `API Docker Image`; require up to date.
   Do **not** require `Security Audit`. Check names appear in the picker only after they have run once.
3. Test: a PR with a failing check must show Merge disabled.
4. Optional: a GitHub Environment `production` with yourself as required reviewer for DB workflows.
5. Verify Dependabot config ran: Insights > Dependency graph > Dependabot shows it.

Evidence: screenshots of each page.

---

## 12. Business and legal (blocker B11)  (no runbook; from plan §11)

Tick each only with a proof (document, screenshot or link):
- Legal entity formed; business bank account open; VAT registration if applicable.
- Jurisdiction filled in ToS, Privacy and AUP; lawyer review done. Tell me where those documents live: I did
  not find the placeholder text in the repo, so I could not check it.
- Replace `@yourplatform.com` placeholders (found in `apps/web/lib/auth.ts`, which is frozen, so tell me before
  I change it).
- Production domain and DNS; SPF, DKIM, DMARC for Resend; mailboxes support@, privacy@, abuse@, noreply@ exist
  (send and receive a test to each).
- Cookie consent live if you serve EU users.
- Jaib voucher stock loaded; manual-transfer wallet details set in Admin.
- Announcement channel and a monitored support channel ready.

---

## 13. Product walk-through on a real phone (blocker B12)

Run each once and keep notes or screenshots:
1. Register, verify email, login, logout, password reset.
2. Redeem end to end: Admin generates a code, a user redeems it, balance is credited.
3. Manual claim: submit, Admin approves, balance credited once.
4. Chat with 3 or more models; balance drops by the expected amount each time.
5. Arabic RTL screens on a real device.
6. Production domain loads signed out in a private window with **no Vercel login wall** (Deployment Protection).
7. Suspend a test user: cookie session and API key both get 403; sessions are gone; you cannot suspend yourself;
   an admin cannot suspend a superadmin.
8. Two concurrent requests from one user: the second gets `409`, before any provider call (only meaningful with
   real Redis; the load test covers it at scale).

---

## 14. Send me the evidence

Reply with, per step: screenshots or SQL output, run links, and the filled RTO. I re-walk `LAUNCH_GATE.md`,
tick lines that have evidence, and list what is left. Any item you choose to defer needs a written reason.

Break-glass lines live in each runbook: `SECURITY_SWEEP.md` section 4 (login 500 after deploy, admin lockout,
413 on `/chat`), `DEPLOY_SHUTDOWN.md` (hanging deploys), `deploy-rollback.md`, `API_CONTAINER.md` (rollback).
