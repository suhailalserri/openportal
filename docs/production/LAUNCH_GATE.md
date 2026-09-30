# Launch gate (P4.3): evidence pack

Session 32, 2026-09-30. Walks `docs/MASTER_PLAN.md` §11 line by line.
Nothing was built or run. Evidence is what the repo shows; every claim about
production is either owner-stated or unverified.

## Verdict: NO-GO

The gate cannot pass today. The blockers are owner-side proofs, not missing code
(except B10, a plan/repo mismatch). "Launch happens after this session" (plan §9)
only once every line below is `DONE` or `DEFERRED` in writing.

### Status legend
- **DONE**: evidence in hand (test in CI the owner saw green, or owner-observed output).
- **CODE-READY**: implemented and tested in the repo; production proof still missing.
- **OWNER-PROOF**: cannot be shown from the repo; needs a dashboard, command output or drill.
- **BLOCKED**: an upstream phase is not finished, or a plan/repo mismatch must be fixed first.
- **DEFERRED**: only with a written reason from the owner. None so far.

Evidence tags: **[R]** read in the repo, **[S]** stated by the owner, **[O]** owner-observed output,
**[T]** a test that exists in `apps/api` (the owner reported CI green through Session 30; latest
commit not seen).

Step-by-step instructions for every blocker: `docs/production/OWNER_PLAYBOOK.md`.

## Ordered blocker list

| # | Blocker | Why it blocks | Proof needed |
|---|---|---|---|
| B1 | Hosting plans: Vercel Pro (L16), Upstash paid (L15), Render api + gateway paid (L17), Supabase Pro x2 (L18). Last known: all Free [S, Session 5] | Fail-closed paid path dies on Upstash quota; Hobby is non-commercial; Free Render sleeps | Screenshot of each billing page |
| B2 | Migrations 0017-0020 applied to prod, **0019 before deploy** | RLS gap (N10), login rate-limit table, price history | RLS query returns 0 rows; `\d rate_limit`; `provider_prices` row count |
| B3 | Seed backdoor check (`admin@localhost.dev`) | Public password on a superadmin | SQL result, 0 rows |
| B4 | Redis `noeviction` + failed-job drill (P2.3) | BullMQ and locks can be evicted | Upstash Eviction toggle screenshot; runbook drill |
| B5 | Alert drills (P2.2), Sentry drill (P2.1) | Silent failures | One Telegram message per source |
| B6 | Mid-stream deploy drill (P3.2), Render shutdown delay 120 s | Unbilled or lost streams | Drill result in `DEPLOY_SHUTDOWN.md` |
| B7 | Backup + restore drill, RTO written (P4.1) | No recovery proof | Run links + RTO in runbook section 6 |
| B8 | Load test passed against staging (P4.2) | Pool, Redis growth, unbilled completions unproven | `LOAD_TEST.md` section 7 filled |
| B9 | Owner steps for P3.4 / P3.5 / P3.6 (rotation rehearsal, secret scanning, branch protection, `METRICS_TOKEN`, Turnstile secret, `ADMIN_REQUIRE_2FA`, price drill) | Security items are CODE-READY only | Per-step evidence, see section "Security" |
| B10 | ADR-011 in this zip is `DRAFT` with ⬜ cells; Session 5 says Accepted | §11 needs "no ⬜ left" | Owner's copy of `decisions.md`, or fill the cells and set Accepted |
| B11 | Business and legal items (entity, jurisdiction, lawyer, DNS, email, Jaib stock, support channel) | Not code; none evidenced | Owner ticks with evidence |
| B12 | Product walk-throughs on a real phone (register, redeem, manual claim, 3+ models, RTL) | Untested end to end | Owner test notes |

## §11 line by line

### Access and money

| Line | Status | Evidence / what is missing |
|---|---|---|
| Suspended/flagged user locked out on REST + tRPC, cookie + API key | CODE-READY | P1.1 ticked in the tracker. [T] `routers/account-guard.test.ts`, `utils/account-guard.test.ts`, `middleware/auth.middleware.test.ts`. Prod check: suspend a test user, confirm 403 by cookie and key. |
| Sessions revoked on suspend; no self-suspend; admin cannot suspend superadmin | CODE-READY | [T] same files; migration `0018_revoke_sessions_on_lockout` must be in prod (B2). |
| Concurrent same-user requests rejected before provider call, on real Redis | CODE-READY | [T] `services/billing-lock.service.test.ts`; CI `api-tests` runs a `redis:7-alpine` service (`deploy.yml`). Session 12: owner confirmed the P1.2 manual checks; P1.2 ticked. |
| Rate-limit/fraud identity cannot be forged by headers | CODE-READY, with a caveat | P1.3 ticked. [T] `utils/client-ip.test.ts`. **Open manual check (Session 12):** on Render log `request.ip`, `cf-connecting-ip`, `x-forwarded-for` once and set `TRUSTED_PROXY_HOPS`. If never done, direct callers may share one identity (coarse, not forgeable). Ask the owner. |
| Ledger invariant holds after load test | BLOCKED on B8 | `infra/scripts/ledger-check.sql` + [T] `services/ledger-check.test.ts`. No load run yet. Holds only while `SIGNUP_BONUS_MICRO_CREDITS = 0` (Session 29). Checked [R]: the welcome bonus (`welcome-bonus.service.ts`) credits through `creditBalance`, which writes a transaction in the same DB transaction, so it does not break the invariant. |
| Migration 0017 applied in prod; RLS query returns zero rows (N10) | OWNER-PROOF | Migration file exists [R]. Query is in ADR-011. Also run it for the **gateway** Supabase project. |

### Visibility

| Line | Status | Evidence / what is missing |
|---|---|---|
| Sentry live on web and api; PII scrubbed | CODE-READY | P2.1 ticked. [T] `monitoring/error-capture.test.ts`, `monitoring/options.test.ts`, `monitoring/sentry.test.ts`. Needs `SENTRY_DSN` on Render and the `/internal/sentry-test` drill; confirm the event appears in Sentry. |
| Telegram receives app, Sentry, uptime, deploy-fail alerts (each drilled) | OWNER-PROOF | P2.2 unticked. [T] `monitoring/alert-rules.test.ts`, `sentry-webhook.test.ts`, `telegram.test.ts`. Needs `SENTRY_WEBHOOK_TOKEN`, uptime monitor, Render/Supabase relays, four drills (`docs/runbooks/ALERTING.md`). |
| Redis `noeviction`; retention live; failed-job metric and alert working | OWNER-PROOF | P2.3 unticked. [T] `jobs/queue-retention.test.ts` (real Redis), `jobs/job-failures.test.ts`, `jobs/redis-health.test.ts`. Needs Upstash Eviction off + drill (`REDIS_POLICY.md`). |

### Infrastructure

| Line | Status | Evidence / what is missing |
|---|---|---|
| ADR-011 accepted (no ⬜); gateway reachable only from api or protected; Redis private | BLOCKED (B10) | Zip copy is DRAFT. Gateway was **public** (401 on `/v1/models`) on 2026-09-29 [O]; the plan allows "protected", so the ADR must record the protection (token-only) as accepted risk or the network fix. Upstash is reached over TLS with a password, not a private network; state this in the ADR. |
| Upstash paid; Vercel Pro; Render paid; both Supabase Pro with a backup taken and a restore tried | OWNER-PROOF (B1, B7) | Last known state: all Free [S]. |
| `/metrics` no longer public (N9) | CODE-READY | P3.5 code: Bearer guard `METRICS_TOKEN` [T] `security/plugins.test.ts`. Prod check: `curl -i https://<api>/metrics` returns 401. Confirm the uptime/Prometheus consumer (if any) sends the token. |
| Graceful shutdown verified with a mid-stream deploy | OWNER-PROOF | P3.2 code [T] `lifecycle/shutdown.test.ts`, `readiness.test.ts`. Needs Render shutdown delay 120 s and the drill. Combine with the P4.2 mid-test deploy. |
| Container non-root, compiled, healthcheck | CODE-READY | CI job `API Docker Image` asserts non-root, healthcheck, no dev deps, boot (`deploy.yml`). Needs CI green on the latest commit and a verified Render deploy (`API_CONTAINER.md`). |
| Secret-rotation runbook rehearsed once | OWNER-PROOF | Runbook + `INTERNAL_SERVICE_TOKEN_PREVIOUS` code [T] `utils/internal-token-rotation.test.ts`. Rehearsal (25 requests before/after, zero 401s) not done. |

### Security

| Line | Status | Evidence / what is missing |
|---|---|---|
| CORS, headers, body limits, Zod limits, admin 2FA enforced, Turnstile live | CODE-READY, Turnstile OFF | [T] `security/plugins.test.ts`, `input-bounds.test.ts`, `admin-2fa.test.ts`. `ADMIN_REQUIRE_2FA` defaults **off**: must be set `true` on Render and the admin account must have 2FA. Turnstile is off without its secret (Session 25). Both need owner action or a written deferral. |
| Dependabot, audit, secret scanning, branch protection on | OWNER-PROOF | Files exist: `.github/dependabot.yml`, `security-audit.yml`. Secret scanning, push protection and branch protection are GitHub settings; screenshots needed. Required checks named in the checklist are `API Tests (Testcontainers)` and `Web Build (next build)`. |
| Provider-cost guard alerting | CODE-READY | [T] `price-guard.test.ts`, `price-guard.service.test.ts`, `routers/models-price-guard.test.ts`. Needs 0020 in prod, one `price-audit` run, and the 0.5-markup drill (`PRICE_GUARD.md`). Unverified: OpenRouter response shape, id match rate. |
| (added from the old checklist) seed backdoor, `db-ops` reset understood | OWNER-PROOF (B3) | `seed.ts` and reset now refuse when users exist [R]. Still check prod for `admin@localhost.dev`. |

### Recovery

| Line | Status | Evidence / what is missing |
|---|---|---|
| Supabase backup tier documented; independent nightly export running | OWNER-PROOF | `db-backup.yml` (02:17 UTC) [R]. Needs R2 bucket + secrets, one green `DB Backup` run, tier cells filled in `backup-restore-drill.md`. |
| Restore drill done; RTO recorded | OWNER-PROOF | `db-restore-drill.yml` [R]. RTO cell blank by design. |

### Business and legal

All OWNER-PROOF. No repo evidence, and I did not verify placeholders: a search for
`YOUR JURISDICTION` in `docs/legal` and `apps/web` found 0 hits, and `@yourplatform.com` appears in
`docs/LAUNCH_CHECKLIST.md`, `docs/FRONTEND_REBUILD_PLAN.md` and frozen `apps/web/lib/auth.ts`.
Where the ToS/Privacy/AUP text actually lives was not located this session, so treat the
jurisdiction line as unchecked, not as passed. Also check the `legal-docs-sync` CI job's scope.

### Product

All OWNER-PROOF; nothing can be shown from the repo. "Load test passed" is BLOCKED on B8.
Add from ADR-011: load the production domain signed out in a private window; Vercel
Deployment Protection must not show a login wall.

## Suggested order for the owner
1. B1 plans (unblocks staging and drills). 2. B2 + B3 (migrations, seed check). 3. B4, B5, B6 (drills).
4. B7 backup + restore. 5. B8 load test with a mid-test deploy (also proves B6). 6. B9 security steps.
7. B10 ADR. 8. B11/B12 business and product. 9. Send evidence; a follow-up session re-walks this file and ticks.

## Not verified in this session
Everything about production and CI on the latest commit. I counted tests by file name; I did not run
them. I did not open every test to confirm it asserts the exact bullet it is mapped to.
