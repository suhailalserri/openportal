# Load test (plan P4.2)

**Goal:** show that the api holds up under concurrent paid chat, that no completed response goes unbilled, that the one-request-per-user lock works, and that a deploy in the middle loses nothing beyond the shutdown grace.

**Status:** code delivered, **nothing has been run**. P4.2 is done only when a run passes all of section 6 and section 7 is filled in.

**Cost warning:** every stream is a real provider call through the gateway. Use a cheap model. Defaults are 60 streamers plus 5 same-user groups for 6 minutes, each call capped at 48 output tokens and paced at one every 4 to 8 seconds per user: roughly 3,000 to 4,500 tiny calls. Check your provider dashboard afterwards.

## 1. What runs where

| Piece | What it does |
|---|---|
| `infra/loadtest/setup.sh` | Creates users `loadtest-0001@example.invalid` ... (default 90), each with an API key derived from `LOADTEST_SEED`, and tops each up to 50 credits **through a ledger transaction** so the ledger check stays valid. Refuses a database that has real users. |
| `infra/loadtest/chat.k6.js` | Scenario `streams`: 60 users, one each, streaming for the duration. Scenario `same_user`: 5 users, 4 clients each firing at the same moment; only one may run, the rest must get `409 REQUEST_IN_PROGRESS` (P1.2). |
| `infra/loadtest/reconcile.sql` | After the run: every completed response must have exactly one matching `usage_debit` with the same cost; k6's completed count must not exceed the debits. |
| `infra/scripts/ledger-check.sql` | The P4.1 invariant (sum of transactions = sum of balances). |
| `infra/loadtest/teardown.sh` | Deletes only `loadtest-%@example.invalid` users and their rows. |
| `.github/workflows/load-test.yml` | One button that does all of the above and writes the result to the run summary. |

## 2. One-time staging setup (no staging exists today)

The result is only meaningful if staging matches production: same Render instance type as production (L17), same `DATABASE_POOL_MAX`, Redis with `noeviction`. Record the values in section 7.

1. **Database:** create a second Supabase project (staging). Copy its session-mode string (port 5432).
2. **Redis:** a separate Upstash database, `noeviction` (`docs/runbooks/REDIS_POLICY.md`). Never share production Redis: the load test would trip production rate limits and locks.
3. **Api:** a second Render web service from the same repo and Dockerfile (`docs/runbooks/API_CONTAINER.md`), its own env values: staging `DATABASE_URL`, staging `REDIS_URL`, fresh `BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_TOKEN`, `CODE_SALT`, `METRICS_TOKEN`. Leave `TELEGRAM_*` and `SENTRY_DSN` unset (or accept the alerts). Note the gateway settings: `GATEWAY_URL` / `GATEWAY_MASTER_KEY` may point at the production gateway, in which case load-test traffic shows up there and costs real money.
4. **Secrets** (GitHub, Repo, Settings, Secrets and variables, Actions): `LOADTEST_BASE_URL`, `LOADTEST_DATABASE_URL`, `LOADTEST_SEED` (long random), optionally `LOADTEST_METRICS_TOKEN` (= the staging api's `METRICS_TOKEN`).
5. **Migrate staging:** Actions, **DB Operations**, run with `target = staging`, task `migrate`, then `constraints`, then `seed-models`. (`target` defaults to production; the workflow refuses to run if the staging secret is empty or equals the production URL.) Do not run `seed` on staging.
6. **Make one cheap model callable:** the model must be `published` and `available` with a non-zero wholesale price, or the price guard and billing checks will complain. In the staging Supabase SQL editor, for the id you chose:
   `update models set status = 'published', is_available = true where id = '<MODEL_ID>';`
   then confirm `select id, status, is_available, wholesale_cost_input_per_m, wholesale_cost_output_per_m from models where id = '<MODEL_ID>';`
7. Smoke test: `GET <staging>/health` and `GET <staging>/ready` return 200.

## 3. Run it

Actions, **Load Test**, Run workflow: `model` = the cheap model id, `duration` = 6m (default), `stream_vus` = 60, `teardown` = off for the first run so you can inspect the data.

## 4. The deploy in the middle (P3.2)

The run summary prints the start time. About **2 minutes** in, trigger a deploy of the **staging** api (Render, Manual Deploy, latest commit), and write down the time you tapped it and when Render says it is live. During the drain, new `/chat` calls get a retryable `503`, and streams in flight finish or are cut at the drain deadline and billed for what they streamed (`docs/runbooks/DEPLOY_SHUTDOWN.md`).

## 5. While it runs and after

- **DB pool:** Render logs for `too many clients`, `remaining connection slots`, `timeout`, `ECONNRESET`; Supabase, Database, Connections graph for a flat line at the pool ceiling.
- **Redis memory:** Upstash console, memory graph and key count before, during, after. Expect it to plateau, not climb. Confirm the policy still reads `noeviction`.
- **Jobs:** the summary compares `aip_job_failures_total` before and after; it must not rise.
- **Errors:** `aip_upstream_errors_total` and Render logs for provider `429`/`5xx` (an upstream throttle is a finding about the provider quota, not a bug in the api).
- **Cost:** the provider dashboard.

## 6. Pass criteria (from the plan)

All of these, read from the run summary:

1. `server_500 = 0` and `unexpected_status = 0` in the k6 summary (thresholds enforce it).
2. `lock_409_ok_body > 0` and `lock_409_bad_body = 0`: the same-user scenario really hit the lock.
3. **No unbilled completions:** the **Billing reconciliation** block has no `|f` line: `unbilled_completions = 0`, `double_billed_requests = 0`, `cost_mismatch = 0`, `completed_streams_without_a_debit = 0`.
4. **Ledger invariant** block has no `|f` line.
5. **No pool exhaustion** and **no unbounded Redis growth** (section 5).
6. **No lost streams beyond the shutdown grace:** `deploy_window_errors` (status 0/502/503/504) in `ERRLOG` lines fall inside your deploy window plus the grace period, and nothing outside it. Anything before the deploy is a real failure.
7. `account_locked_403` and `insufficient_402` are 0. If not, see below.

Reading odd results:
- `rate_limited_429` > 0: the per-user limit is 20 per minute; the pacing should keep it near 0. A few are noise; many mean the pacing or the limit changed.
- `insufficient_402`: raise `LT_CREDITS_MICRO` in the workflow env and rerun setup.
- `account_locked_403` or `info_users_fraud_flagged` > 0: all load comes from one runner IP, which the fraud service sees as many accounts on one IP. That signal is recorded by design; if it actually flags or locks the test users, that is a finding to report, not something to hide by disabling the check.
- `info_debits_without_saved_message` > 0: the assistant message is saved after billing without being awaited; a few on a hard kill are expected, a steady stream is a bug worth a ticket.

## 7. Results (owner fills in after the run)

| Item | Value |
|---|---|
| Date / staging api commit | |
| Render instance type / count, `DATABASE_POOL_MAX` | |
| Model / duration / streamers | |
| Streams completed / 409 / 429 / deploy-window errors | |
| Deploy started / live | |
| Reconciliation and ledger check | pass / fail |
| Pool, Redis, job-failure observations | |
| Provider cost of the run | |
| Verdict | |

Afterwards run the workflow with `teardown` on (or `bash infra/loadtest/teardown.sh` with the staging `DATABASE_URL`) and, if you want, pause the staging services.
