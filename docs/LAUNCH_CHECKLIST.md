# Launch checklist

Rewritten 2026-09-29 (plan P0.2) to match the real stack: Vercel (web),
Render (api + gateway), Supabase (Postgres), Upstash (Redis); payments are
Jaib vouchers + manual transfer (ADR-007). The gate is the plan's §11 in
`docs/MASTER_PLAN.md`; walk it with evidence in
session P4.3. **Nothing here is ticked unless someone verified it.**
Items name the plan phase that produces the evidence.

## Hosting plans (must be true before real users)
- [ ] Vercel on **Pro**, not Hobby (Hobby is non-commercial) — L16
- [ ] Upstash on a **paid** plan (Fixed or Pay-as-you-go), not Free — L15
- [ ] Render api and gateway on **paid** instance types (no spin-down) — L17
- [ ] Supabase plan documented: daily-backup retention, PITR yes/no — P4.1
- [ ] ADR-011 status **Accepted** (no ⬜ cells) — P0.1

## Access & money
- [ ] Suspended/flagged user locked out on REST + tRPC, cookie + API key — P1.1
- [ ] Sessions revoked on suspend; no self-suspend; admin cannot suspend superadmin — P1.1
- [ ] Concurrent same-user requests rejected before any provider call, tested on real Redis — P1.2
- [ ] Rate-limit / fraud identity cannot be forged with headers — P1.3
- [ ] `/chat` rate limit is shared across replicas (Redis) and gives no false 429 for steady chat — P3.1
- [ ] Ledger invariant holds after load test (sum of transactions = sum of balances) — P4.2

## Database
- [ ] All migrations applied to Supabase (`pnpm --filter @ai-platform/db db:migrate:manual`), including `0017_platform_config_rls`
- [ ] RLS query returns zero rows (see ADR-011) — N10
- [ ] Seed admin account created; seed test credentials removed or rotated
- [ ] Independent nightly export running outside Supabase; restore drill done; RTO recorded — P4.1

## Visibility
- [ ] Sentry live on web and api, PII scrubbed — P2.1 (built; needs `SENTRY_DSN` on Render + the `/internal/sentry-test` drill)
- [ ] Telegram receives app alerts, Sentry alerts, uptime alerts, deploy failures (each drilled once) — P2.2
- [ ] Upstash eviction is **off** (`noeviction`); job retention live; failed-job alert works — P2.3
- [ ] Upstash memory/command-usage alert configured — P2.3

## Infrastructure & security
- [ ] Gateway reachable only from the api, or protected as ADR-011 records — N8
- [ ] `/metrics` not publicly readable — N9 / P3.5 (code done: set `METRICS_TOKEN`, then `curl` returns 401 without it; SECURITY_SWEEP.md step 6)
- [ ] Graceful shutdown verified with a mid-stream deploy — P3.2
- [ ] Container non-root, compiled, healthcheck — P3.3 (code done; tick after CI `API Docker Image` is green and the Render deploy is verified)
- [ ] Secret-rotation runbook rehearsed once — P3.4 (code + runbook done; tick after the INTERNAL_SERVICE_TOKEN rehearsal and GitHub secret scanning + push protection are on)
- [ ] CORS, headers, body limits, Zod limits, admin 2FA enforced, Turnstile live — P3.5 (code done; legacy admin REST routes deleted; owner steps 2-5 in SECURITY_SWEEP.md; **apply migration 0019 before deploying**)
- [ ] Dependabot, `pnpm audit`, secret scanning, branch protection (`API Tests (Testcontainers)`, `Web Build (next build)`) on — P3.5 (files added; owner steps 7-8)
- [ ] Provider-cost guard alerting; model prices confirmed against `markupMultiplier` — P3.6 (code done, awaiting CI + migration 0020 + drill: docs/runbooks/PRICE_GUARD.md)
- [ ] `db-ops.yml` "reset" options understood; production `DATABASE_URL` secret access limited — P3.5 (reset now refuses when users exist; **first check production for `admin@localhost.dev` (SECURITY_SWEEP.md step 1)**)

## Business & legal
- [ ] Legal entity formed; business bank account open
- [ ] Jurisdiction filled in ToS / Privacy / AUP (`[YOUR JURISDICTION — MUST BE FILLED BEFORE LAUNCH]`); lawyer review
- [ ] VAT registration if applicable
- [ ] Production domain and DNS; SPF/DKIM/DMARC for Resend; support@ / privacy@ / abuse@ / noreply@ exist
- [ ] Legal-doc email placeholders (`@yourplatform.com`) replaced
- [ ] Cookie consent live (if serving EU users)
- [ ] Jaib voucher stock loaded; manual-transfer wallet details set in admin
- [ ] Announcement channel ready

## Product
- [ ] Register → verify email → login → logout → password reset, on a real phone
- [ ] Redeem end-to-end (generate → redeem → balance credited)
- [ ] Manual claim → admin approve end-to-end
- [ ] Chat with 3+ models; balances deducted correctly
- [ ] Arabic RTL checked on a real device
- [ ] Load test passed (50+ concurrent streams, mid-test deploy) — P4.2
- [ ] Support contact channel live and monitored
