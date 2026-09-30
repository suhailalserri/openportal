# openportal — Master Plan: Production Readiness + Chat Capabilities

**Version 2.0 · 2026-09-28**
**Supersedes:** `BACKEND_HARDENING_PLAN.md` and `CHAT_CAPABILITIES_AND_AGENTS_PLAN.md` (delete both, or leave a one-line pointer to this file).
**Companion:** `docs/FRONTEND_REBUILD_PLAN.md` (UI rebuild, unchanged). Where the two touch, this file says exactly how.
Saved as `docs/MASTER_PRODUCTION_AND_CAPABILITIES_PLAN.md`. Session-by-session record: `docs/production/SESSION_LOG.md`. Tick §4 at the end of every session.

Every finding below was checked against the repo zip (`ai-platform (6).zip`), not inferred.

---

## 0. How to run a session

1. **One session = one phase ID** (e.g. `P1.2`). Never mix two.
2. Upload the latest repo zip + this file.
3. Claude first writes a short **before/after summary**: the gap, the change, what could break. You approve, then it builds.
4. **No network in the sandbox.** The verifier is CI (`api-tests`, Testcontainers) plus a manual pass on real Redis/Postgres for anything `fakeRedis.ts` cannot exercise (locks, BullMQ retention, eviction).
5. **Deliverable:** changed files at repo-relative paths + tests. For anything touching auth, money, or fraud, a phase is **not done** without a test that fails on the old code (red) and passes on the fix (green).
6. Small PRs to `main`. No long-lived branch. Each PR revertible on its own.
7. Any change to an external contract (`docs/frontend/API_CONTRACT.md`) is called out and logged in `docs/PR_NOTES.md`.

---

## 1. Ground truth

### 1.1 Confirmed gaps (from the code)

| ID | Finding | Severity |
|---|---|---|
| **G2** | `auth.middleware.ts` checks `status`/`isFraudFlagged` on the internal-token and API-key paths but **not on the session-cookie path**. `trpc.ts`'s `protectedProcedure`/`adminProcedure` check neither. A suspended or fraud-flagged user with a live browser session can still call every tRPC procedure. | **Critical** |
| **G2b** | `admin.updateUserStatus` only flips `users.status`. It does not revoke sessions, does not stop an admin suspending themselves, and does not protect a `superadmin` from a lower admin. | **Critical** |
| **G5** | Free-generation race, self-documented in `gateway.service.ts` (`checkAffordability` comment and the "got N output tokens free" log). Two concurrent requests both pass the pre-check; one is generated with no payment. | **Critical** |
| **G1** | Deployment story was contradictory. Resolved by evidence: `deploy.yml` states the VPS setup was removed; web = Vercel, api = Render. **Still unconfirmed:** where Postgres, Redis and the New API gateway actually run. | **Critical (until P0.1)** |
| **G10** | Client IP = `cf-connecting-ip ?? x-forwarded-for ?? req.ip` in **both** `apps/api/.../trpc.ts` and `apps/web/server/context.ts`. On Vercel (no Cloudflare in front) a caller can forge `cf-connecting-ip`. Worse, `apps/web/app/api/chat/route.ts` forwards only `X-User-ID`/`X-User-Email` to the api, so the api sees **Vercel's IP, not the user's**. Per-IP rate limiting and fraud velocity are therefore weak or meaningless for web traffic. | **High** |
| **G3** | No error tracking in `apps/api`. Web has Sentry; api has none. | **High** |
| **G4** | `infra/alerts.yml` rules page nobody (no Alertmanager exists). Likely irrelevant on Render anyway. | **High** |
| **G6** | BullMQ queues have no `removeOnComplete`/`removeOnFail`, no `failed` handler, no failed-job metric. | **Medium** |
| **G9** | `rate-limiter.ts` `checkLimit` is a per-process in-memory counter. Wrong under >1 replica. | **Medium** |
| **G11** | No restore runbook or drill. | **Medium-High** |
| **G8** | `apps/api/Dockerfile` runs as root, runs `tsx` on source, ships dev deps, no `HEALTHCHECK`. | **Low-Medium** |
| **G12** | No secret-rotation runbook. | **Low-Medium** |

### 1.2 New gaps found while merging (not in either original plan)

| ID | Finding | Severity |
|---|---|---|
| **N1** | **Redis eviction policy.** `allkeys-lru` (compose file) can silently evict BullMQ jobs, rate-limit counters and the new in-flight locks. BullMQ requires `noeviction`. The Render/managed Redis policy is unverified. | **High** |
| **N2** | **No graceful shutdown.** A Render deploy sends SIGTERM mid-stream. In-flight `/chat` streams must finish or be billed as partial before exit. Unverified in `index.ts`. | **High** |
| **N3** | **Stale `LAUNCH_CHECKLIST.md`.** Still lists VPS, Docker Compose, Caddy, MinIO, Stripe. None match the real stack or the Yemen payment pivot (ADR-007). A checklist that lies is worse than none. | **High** |
| **N4** | **Chat contract is `{role, content: string}[]`** with a frozen web proxy route. Attachments and structured blocks need *optional*, backward-compatible fields or every existing caller 400s. | **Medium** |
| **N5** | **Attachment and voice safety** absent from the capabilities plan: upload quotas, orphan cleanup, deletion on account/conversation delete, prompt-injection framing of extracted text, worker memory/time limits, audio deleted after transcription. | **Medium** |
| **N6** | **Security sweep never done as a unit:** CORS, security headers, body-size limits, admin 2FA enforcement, dependency and secret scanning, branch protection. | **Medium** |
| **N7** | **Provider-cost guard.** Credits are priced with a markup over gateway cost. A wrong price or provider price change silently sells at a loss. `price-audit.ts` exists but nothing alerts. | **Medium** |
| **N8** | **Gateway exposure.** New API (`GATEWAY_URL`, root token) must not be publicly reachable. Where it runs is unconfirmed. | **High (until P0.1)** |
| **N9** | **`/metrics` is unauthenticated** on the public api URL (`index.ts`; its comment assumes an internal Docker network). Exposes business and process metrics. Fix in P3.5. | **Medium** |
| **N10** | **`platform_config` (0014) never got RLS**, so Supabase's Data API may expose it. Fixed by migration `0017`; must be applied to prod and verified (added 2026-09-29). | **High** |
| **N11** | **Upstash Free = 500K commands/month.** BullMQ polling plus per-request counters and the P1.2 lock can exhaust it; Redis then refuses commands and the fail-closed paid path takes chat down. See L15. | **High** |
| **N12** | **Vercel Hobby is non-commercial only.** Charging users violates its terms, and exceeded limits pause features for 30 days. See L16. | **High** |
| **N13** | **Render Free instances** spin down after 15 min, have no persistent disk, cannot receive private traffic, cannot scale past 1. If the api or gateway is on Free: see L17. Plan tier unconfirmed. | **High (until P0.1)** |

### 1.3 Already good (do not re-litigate)
Fail-closed env validation in `config.ts`. HTTP listener starts before workers. Money paths (`balance`, `redeem`, `fraud`, `gateway`) have Testcontainers tests including concurrency. `approveManualPayment` is atomic and idempotent (status flip `WHERE status='pending'` inside one transaction). Client-disconnect → upstream abort is correct. Audit log covers admin mutations. `0007`/`0008` Supabase RLS fixes were correct and important.

---

## 2. Decisions (all locked — nothing left open)

| # | Decision |
|---|---|
| **L1** | **Topology:** web = Vercel, api = Render. P0.1 *verifies* where Postgres, Redis, and the gateway run and records it; it does not reopen the choice. Anything found running elsewhere is either adopted into the ADR or removed. |
| **L2** | **Object storage: Supabase Storage.** One private bucket family, signed upload/download URLs only, service-role key used **server-side only**, never sent to a browser. The API never proxies file bytes. |
| **L3** | **Manual payments: no screenshot upload.** You verify payments yourself. `screenshotUrl` stays optional and is **not** built out. Frontend deferral D8 is closed as *won't do*. |
| **L4** | **MinIO and the VPS docker-compose stack are retired** (Postgres/Redis/Grafana/Prometheus/Loki/Gatus/Caddy/backup) unless P0.1 finds one is genuinely in use, in which case it is documented, not left ambiguous. |
| **L5** | **Error tracking: Sentry** (same as web). **Alerts: Telegram**, reusing `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` from `alert.worker.ts`. |
| **L6** | **Assume multi-replica api.** Rate limiting and locks are Redis-based from day one. |
| **L7** | **Stream protocol:** Anthropic-Messages-style content blocks, shared types in `packages/types`, versioned by `Accept: application/vnd.aip.stream+v2`. Old plain-text stream stays the default until the new UI ships. |
| **L8** | **One ledger.** Every billed operation (chat, transcription, later agents) goes through `balance.service` / `transactions`. |
| **L9** | **Transcription: server-side, authoritative**, editable in composer, never auto-sent. Web Speech API only as optional live preview. |
| **L10** | **Document extraction:** `pdf-parse` + `mammoth` as BullMQ jobs with memory/time limits. Images re-encoded server-side before use. |
| **L11** | **Sandbox (Track C): managed microVM provider (E2B or equivalent)**, separate deployable, egress via mediated proxy only. Provider chosen at P7.1 after a spike; not built in-house. |
| **L12** | **Fail closed on money and auth; fail open on everything else.** No new external call (Sentry, Telegram, Supabase, Redis) may take down `/chat` or `/trpc`. No `process.exit(1)` reachable from a request path. |
| **L13** | **Launch line = end of Stage 4.** Stages 5–6 (attachments, mic, streaming) are post-launch features (they may ship earlier, but never by skipping the Stage 4 gate). Stage 7 (agents) starts only after Stage 4 is signed off *and* Stages 5–6 are stable. |
| **L14** | **Shared guards, never copy-paste.** Account-usability checks live in one function used by every auth path. |
| **L15** | *(added 2026-09-29, owner delegated)* **Redis: move Upstash off Free before any real user** — Fixed plan (from $10/month, no per-command billing) or Pay-as-you-go. Free is for dev/test only. |
| **L16** | *(added 2026-09-29)* **Vercel Pro before charging anyone.** Hobby is non-commercial. |
| **L17** | *(added 2026-09-29)* **Render api and gateway on a paid instance type before launch** (no spin-down; needed for L6 multi-replica; the gateway needs a persistent database or disk). P0.1 result (2026-09-29): **both are on Free, region oregon**, so this line is open. |
| **L18** | *(added 2026-09-29)* **Supabase: both projects (app and gateway) on Pro before launch.** Free has no downloadable backups and pauses after a week idle; the ledger lives there. PITR add-on decided in P4.1. |

---

## 3. Roadmap at a glance

```
STAGE 0  Ground truth        P0.1 verify infra · P0.2 repo cleanup + real checklist
STAGE 1  Money & access      P1.1 account guard · P1.2 billing lock · P1.3 client-IP chain
STAGE 2  Visibility          P2.1 Sentry · P2.2 alerts · P2.3 queues + Redis policy
STAGE 3  Scale & safety      P3.1 Redis rate limit · P3.2 graceful shutdown · P3.3 container
                             P3.4 secrets · P3.5 security sweep · P3.6 cost guard
STAGE 4  Recovery & launch   P4.1 backup drill · P4.2 load test · P4.3 LAUNCH GATE
══════════════════════════ LAUNCH LINE ══════════════════════════
STAGE 5  Storage & inputs    P5.1 Supabase Storage · P5.2 attachments · P5.3 mic
STAGE 6  Streaming           P6.1 protocol · P6.2 normalization · P6.3 UI · P6.4 persistence · P6.5 tool-call groundwork
STAGE 7  Agents (gated)      P7.1 runtime · P7.2 tools + egress · P7.3 billing/fraud · P7.4 UI
```

Total before launch: **~15 sessions**. Stage 5–6: **~9**. Stage 7: scope again when you get there.

---

## 4. Progress tracker

**Stage 0** — [x] P0.1 · [x] P0.2
**Stage 1** — [x] P1.1 · [x] P1.2 · [x] P1.3
**Stage 2** — [x] P2.1 · [ ] P2.2 · [ ] P2.3 (code done, awaiting owner drill: docs/runbooks/REDIS_POLICY.md)
**Stage 3** — [ ] P3.1 (code done, awaiting owner checks: SESSION_LOG session 20) · [ ] P3.2 (code done, awaiting owner steps + drill: docs/runbooks/DEPLOY_SHUTDOWN.md) · [ ] P3.3 (code done, awaiting CI + owner deploy: docs/runbooks/API_CONTAINER.md) · [ ] P3.4 (code + runbook done, awaiting owner rehearsal: docs/runbooks/secret-rotation.md) · [ ] P3.5 (code done, awaiting owner steps: docs/runbooks/SECURITY_SWEEP.md) · [ ] P3.6 (code done, awaiting CI + migration 0020 + owner drill: docs/runbooks/PRICE_GUARD.md)
**Stage 4** — [ ] P4.1 (code done, awaiting secrets + first real drill + RTO: docs/runbooks/backup-restore-drill.md) · [ ] P4.2 (code done, awaiting staging + first run + results: docs/runbooks/LOAD_TEST.md) · [x] P4.3 **← LAUNCH GATE** (ticked on the owner's word, 2026-09-30: owner states the gate is cleared; Claude did not re-walk it. First walk was NO-GO, evidence pack: docs/production/LAUNCH_GATE.md)
**Stage 5** — [x] P5.1 (ticked 2026-09-30: CI green, migration 0021 applied, buckets live, owner verified docs/runbooks/STORAGE.md section 4 steps 1-3; step 4 end-to-end check happens with P5.2) · [x] P5.2 (ticked 2026-09-30: 5.2a and 5.2b CI green, owner passed docs/runbooks/ATTACHMENTS.md section 4b) · [x] P5.3 (ticked 2026-10-01: CI green after the Session 43 type fix, owner passed docs/runbooks/VOICE.md section 4)
**Stage 6** — [ ] P6.1 (code done, awaiting CI + owner check: docs/PR_NOTES.md Session 44) · [ ] P6.2 (code done, awaiting CI + owner check: docs/PR_NOTES.md Session 45) · [ ] P6.3 · [ ] P6.4 · [ ] P6.5 (code done, awaiting the owner's spike run: docs/runbooks/TOOL_SPIKE.md)
**Stage 7** — [ ] P7.1 · [ ] P7.2 · [ ] P7.3 · [ ] P7.4

---

## 5. Stage 0 — Ground truth

### P0.1 Verify real infrastructure (1 session, no code)
**Closes:** G1, N8. **Blocks:** P2.2, P2.3, P3.1, P4.1.
- **Do:** For each of Postgres, Redis, New API gateway, api, web: record *provider, plan/tier, region, who has access, how it's backed up, how it's monitored*. Confirm specifically:
  - Postgres provider (Supabase?) and whether the plan includes daily backups / PITR.
  - Redis provider, version, and `maxmemory-policy` (run `CONFIG GET maxmemory-policy`). Must be `noeviction` (N1).
  - Gateway host. It must be reachable **only** from api (private network or IP allow-list), never public (N8). `GATEWAY_ROOT_TOKEN` must not be reachable from the internet.
  - Whether `api.onrender.com` is directly reachable, and whether requests carry a trustworthy `cf-connecting-ip` (feeds P1.3).
  - Whether Render runs ≥2 instances or autoscaling is on.
- **Output:** new `ADR-011: Production topology` in `docs/architecture/decisions.md` (one paragraph + a table).
- **Done when:** ADR-011 answers every bullet above with a fact, not an assumption.

### P0.2 Repo cleanup + a checklist that tells the truth (1 session)
**Closes:** N3, L4.
- Remove or clearly mark dead: `infra/docker-compose.yml` services not in use, `Caddyfile`, `gatus.yml`, `prometheus.yml`, `alerts.yml` (keep `alerts.yml` expressions as a reference list until P2.2 converts them), `backup.sh`, `deploy.sh`, MinIO variables in `config.ts` and `.env.example`.
- Rewrite `docs/LAUNCH_CHECKLIST.md` from scratch to match reality (Vercel/Render/Supabase/Redis/gateway; Jaib + manual transfer; remove Stripe/PayPal/VPS/Docker/Caddy/MinIO items). Structure it to mirror §11 below.
- **Done when:** no file in the repo describes infrastructure you don't run, and every checklist item is something you can actually tick.

---

## 6. Stage 1 — Money & access (do these first after P0.1)

### P1.1 Account guard + admin protections (1 session)
**Closes:** G2, G2b.
- **Build:**
  1. One helper `assertUsableAccount(user)` returning `{ ok:true } | { ok:false, reason:"suspended"|"fraud_flagged" }`, in a shared module.
  2. Call it from: `authMiddleware` (**all three paths**, including session cookie), `protectedProcedure`, `adminProcedure`. Because `apps/web/server/context.ts` feeds the *same* `appRouter`, guarding the procedures covers both the Fastify and Next.js entry points. Add a test proving that.
  3. `protectedProcedure` throws `FORBIDDEN` with a stable, frontend-mappable message (`ACCOUNT_SUSPENDED` / `ACCOUNT_UNDER_REVIEW`) matching the copy `/chat` already returns.
  4. `updateUserStatus`: on `suspended`, delete the user's rows in `sessions` and clear `apiKeyHash` use path (API key stays but is blocked by the guard). Reject `userId === ctx.user.id` (no self-suspend). Only `superadmin` may suspend an `admin`/`superadmin`.
  5. Fraud auto-flag path uses the same session revocation.
- **Tests (red first):** suspended cookie session → `/chat` 403 (currently 200). Flagged user → `billing.redeemCode`, `user.generateApiKey`, `billing.submitManualPayment` all `FORBIDDEN` (currently succeed). Suspending a user deletes their sessions. Admin cannot suspend self or a superadmin. Same tests through the Next.js caller.
- **Done when:** one `updateUserStatus` call fully locks a user out of REST and tRPC, by cookie and by API key.

### P1.2 Per-user in-flight lock (1 session)
**Closes:** G5. Also covers N-item "lock must cover any billed operation."
- **Build:** Redis `SET lock:billed:{userId} <requestId> NX PX <ttl>` acquired **before** `checkAffordability`, released in a `finally` (stream end, error, client abort). TTL = max stream time + margin, and refreshed while streaming so a long stream can't lose its lock. Release only if the stored value equals your requestId (compare-and-delete Lua script), so an expired lock can't be deleted by someone else's request. A second concurrent request gets a clear `409`-style error *before any provider call*. Key on "billed operation", not "chat", so transcription and agents reuse it. Integrate with `chat-idempotency.service` so a client retry of the *same* request is not rejected as a duplicate.
- **Fail-closed rule:** if Redis is down, reject the paid request (503, alert) rather than run without the lock.
- **Tests:** second concurrent request rejected before any provider call; lock released on success, on upstream error, and on client abort; expired-lock takeover safe; existing "10 concurrent deductions" test unchanged and green.
- **Done when:** the tests pass against a real Redis, not only `fakeRedis.ts`.

### P1.3 Client-IP trust chain (1 session)
**Closes:** G10.
- **Build:**
  1. `apps/web/app/api/chat/route.ts` (and any other web→api proxy) forwards the real client IP as `X-Client-IP`, taken from Vercel's trusted header (`x-vercel-forwarded-for` / `x-real-ip`; confirm in Vercel docs at build time). Note: this file is described as a "frozen zone", so this is a small, deliberate, PR_NOTES-logged exception.
  2. api trusts `X-Client-IP` **only** when the request authenticated via the internal token. For direct calls, use `req.ip` with Fastify `trustProxy` pinned to the actual proxy range from P0.1.
  3. Stop preferring `cf-connecting-ip` anywhere unless P0.1 proves Cloudflare is genuinely in front of that specific service. Fix both `trpc.ts` and `web/server/context.ts` and `rateLimit.middleware.ts` to use one shared `getClientIp()`.
- **Tests:** forged `cf-connecting-ip` / `x-forwarded-for` from a direct caller is ignored; internal-token request uses `X-Client-IP`; a request without the internal token cannot supply `X-Client-IP`.
- **Done when:** you cannot get a fresh rate-limit/fraud identity by changing a header.

---

## 7. Stage 2 — Visibility

### P2.1 Backend error tracking (1 session)
**Closes:** G3. Uses L5.
- **Build:** `@sentry/node` initialised at the top of `index.ts`. Capture: tRPC `onError`, `/chat` top-level catch, BullMQ worker `failed` events, unhandled rejections. Tag `service: api`, release = git SHA. Scrub PII (message content, email, `apiKeyHash`, tokens, cookies, `authorization`); share one scrubbing list with the web config. Sentry outage must not affect requests.
- **Tests:** thrown tRPC error → `captureException` called; sensitive fields never present in the captured event.
- **Done when:** a deliberate error on a staging deploy appears in Sentry within a minute.

### P2.2 Alert delivery (1 session)
**Closes:** G4.
- **Build:** since Prometheus/Alertmanager aren't in the Render stack, do it from what exists:
  - App-level `queueAlert()` (already Telegram) for: balance-deduction failure, all-channels-failed, fraud auto-suspend, failed-job burst, Redis lock failure.
  - Sentry alert rules → Telegram (Sentry webhook) for new error types and error-rate spikes.
  - External uptime monitor (UptimeRobot / Better Stack free tier) on web `/api/health`, api `/health`, and a synthetic gateway check → Telegram.
  - Render deploy-fail and Supabase alerts routed to the same Telegram chat (via email-to-Telegram or webhook relay).
  - Convert the useful `alerts.yml` expressions into this list, then delete the file.
- **Done when:** you trigger one of each (kill a health endpoint, throw a Sentry error, fail a job) and a Telegram message arrives within the rule's window.

### P2.3 Queue hardening + Redis policy (1 session)
**Closes:** G6, N1.
- **Build:** `removeOnComplete: { age: 86400, count: 1000 }`, `removeOnFail: { age: 604800 }` per queue. `failed` handler on all four workers → Sentry + `aip_job_failures_total{queue}` metric + Telegram if burst. Confirm/set Redis `maxmemory-policy noeviction` (or use a separate Redis for cache vs queues/locks). Add a Redis memory alert at ~70%.
- **Tests:** against a real Redis: a failing job is captured, counted, and expires on schedule.
- **Done when:** Redis policy verified in prod and the failing-job drill passes.

---

## 8. Stage 3 — Scale & safety

### P3.1 Redis-backed rate limiter (1 session)
**Closes:** G9. **Depends:** P1.3.
- Replace in-memory `checkLimit` with Redis `INCR`+`EXPIRE` (atomic Lua or `MULTI`). Fail **open** on Redis outage for rate limiting only (log + alert), because the affordability check and the P1.2 lock still fail closed on money.
- **As built (P3.1):** new async `utils/redis-rate-limiter.ts` (Lua: INCR, expiry only on first hit). On a Redis outage it degrades to the per-process limit instead of fully open (paid users never blocked, each replica still capped; metric `aip_rate_limit_fallback_total` + throttled alert). Frozen web routes (`redeem`, `delete-account`, `export-data`) still use the sync `checkLimit` until a logged exception is approved.
- **Tests:** two limiter instances sharing one Redis count against one budget; window rolls over correctly.

### P3.2 Graceful shutdown + health/readiness (1 session)
**Closes:** N2.
- On `SIGTERM`: stop accepting new requests, let in-flight streams finish (bounded, e.g. 60–90 s) so billing completes, then close DB/Redis/workers. Set Render's shutdown grace period to match. Split `/health` (liveness) from `/ready` (DB + Redis reachable). Confirm the partial-stream billing path also fires if the process is force-killed at the deadline.
- **Tests:** an in-flight stream during shutdown is billed exactly once.

### P3.3 Container hardening (1 session)
**Closes:** G8.
- Multi-stage build; runtime runs compiled `dist` with production deps only; `USER node`; `HEALTHCHECK` hitting `/health`; pinned base image digest.
- **Done when:** `docker inspect` shows non-root, no `tsx`/dev deps in the final image, and the app boots.
- **As built (P3.3):** `apps/api/build.mjs` bundles with esbuild (not `tsc`: the workspace packages export TypeScript source) into `dist/index.js`; api `dependencies` stay external, `@ai-platform/*` and `postgres` are inlined. 3-stage `apps/api/Dockerfile` (build / prod-deps via `pnpm install --prod --filter @ai-platform/api` / runner), `USER node`, `HEALTHCHECK` on `/health`, `CMD node dist/index.js`. `tsx` moved to devDependencies, `esbuild` (pinned to the repo override 0.21.5) added. Base image is pinned by tag with a `NODE_IMAGE` build arg for a digest. New CI job `API Docker Image`. Render was confirmed to run this Dockerfile (Docker runtime, path `apps/api/Dockerfile`, context `.`, no Docker Command override).

### P3.4 Secrets & rotation (1 session)
**Closes:** G12.
- `docs/runbooks/secret-rotation.md` for each secret in `config.ts` plus Supabase service-role key, Sentry DSN, Telegram token, `INTERNAL_SERVICE_TOKEN` (shared by web and api, so rotate both in order with a short overlap window or accept brief 401s), `BETTER_AUTH_SECRET` (invalidates every session, announce first), `CODE_SALT` (invalidates unredeemed issued codes; check `codeInventory` first). Rehearse one rotation (`INTERNAL_SERVICE_TOKEN`) on staging.
- Enable GitHub secret scanning + push protection.
- **As built (P3.4):** `docs/runbooks/secret-rotation.md` (inventory, order of operations, blast radius, rollback per secret). Zero-401 `INTERNAL_SERVICE_TOKEN` rotation: optional `INTERNAL_SERVICE_TOKEN_PREVIOUS` accepted by the api (`isInternalTokenAuth`, `authMiddleware`, tRPC context, `/internal/sentry-test`), ignored unless 32+ chars, boot warning while set. `authMiddleware` now uses the constant-time compare. No staging exists, so the rehearsal runs on production in a quiet window. `SECURITY.md` added.

### P3.5 Security sweep (1 session)
**Closes:** N6.
- Verify/fix: CORS allow-list (web origin only); security headers on api; request body size limit on `/chat` and tRPC; Zod limits on every free-text field; admin/superadmin **must have 2FA** enabled to use admin procedures; login/registration rate limits and Turnstile confirmed live; Dependabot + `pnpm audit` in CI failing on high severity; branch protection on `main` (required `api-tests`, `web-build`); logs contain no message content or tokens.
- **Done when:** each item has a test or a screenshot/config note in the PR.
- **As built (P3.5):** `apps/api/src/security/` (`plugins.ts`: strict JSON-API CSP, single exact-origin CORS, body limits 1 MiB default / 4 MiB `/chat` (not 2 MiB: under Vercel's 4.5 MB cap, long histories fit), logger redaction, `/metrics` Bearer guard `METRICS_TOKEN`, closes N9; `limits.ts`: shared Zod bounds applied to admin, models, billing and chat inputs; `admin-2fa.ts`: `ADMIN_REQUIRE_2FA=true` gate in `adminProcedure`, default OFF, code `ADMIN_2FA_REQUIRED`; `log-scan.ts` + `log-hygiene.test.ts`). `.github/dependabot.yml`, `.github/workflows/security-audit.yml` (weekly + PR, not a required check). Added during the sweep: `db-ops.yml` / `db-migrate.yml` refuse to reset a database with users, and `seed.ts` refuses a database with users (it created a superadmin with a public password). Owner-approved frozen-zone exceptions, done: the 8 legacy `apps/web/app/api/admin/**` REST routes deleted (no callers; they bypassed the 2FA gate; `rest-admin-guard.test.ts` keeps it that way) and better-auth login rate limit moved to `storage: "database"` (new `rate_limit` table, migration `0019_auth_rate_limit.sql`, nightly `pruneAuthRateLimit` job). **Apply 0019 to production BEFORE deploying.** Still open: Turnstile is off without its secret. Owner steps and click paths: `docs/runbooks/SECURITY_SWEEP.md`.

### P3.6 Provider-cost guard (1 session)
**Closes:** N7.
- Turn `infra/scripts/price-audit.ts` into a scheduled job: for every active model, compare `sellPrice` to gateway cost × required margin; alert (Telegram) if any model sells below cost or a provider price changed. Add a daily "revenue vs upstream cost" number to the admin dashboard.
- **Done when:** editing a model price below cost triggers an alert in a test.
- **As built (P3.6):** the plan's `sellPrice` and "gateway cost" do not exist as such: sell price is `wholesale x markup` on the `models` row and wholesale is admin-typed, so "gateway cost" is taken from OpenRouter's public model list (the real upstream, ADR-011), matched by model id, best-effort. `services/price-guard.ts` (pure checks + digest + OpenRouter parser), `price-guard.service.ts` (DB glue), daily `priceGuard` job at 04:00 UTC (one Telegram digest, silent when clean), and an immediate local-only alert from `models.publish`. Bug found and fixed on the way: nothing ever wrote `provider_prices`, so the dashboard's cost was always $0 and margin ~100%; `publish` now writes price history in the same transaction (`provider-price.service.ts`) and migration `0020_provider_prices_backfill.sql` seeds current prices (history before it is an estimate). `price-audit.ts` now reads the live DB. The "daily revenue vs upstream cost" number already exists in `admin.getDashboardStats` (`cost`, `marginPercent`) and `getRevenueTimeseries`; `apps/web` does not consume them yet (frontend plan). Runbook: `docs/runbooks/PRICE_GUARD.md`.

---

## 9. Stage 4 — Recovery & launch gate

### P4.1 Backup and restore drill (1 session)
**Closes:** G11. **Depends:** P0.1.
- Confirm what Supabase's plan gives (daily backup retention, PITR yes/no) and record it. Add an **independent** nightly export (extend the existing `db-ops.yml` GitHub Action) to storage outside Supabase. `docs/runbooks/backup-restore-drill.md`: exact commands to restore into a scratch DB, plus a verification checklist (`users` count, `balances` sum, latest `transactions` timestamp, ledger invariant: sum of transactions = sum of balances).
- **Done when:** the drill has been run for real once, passed, and the wall-clock time is written into the runbook as your RTO.
- **As built (P4.1):** not an extension of `db-ops.yml` (manual-only, `task`-driven, holds the `reset` guard): new `.github/workflows/db-backup.yml` (02:17 UTC + manual; `pg_dump` custom format with a PG17 client, AES-256 encrypted with `BACKUP_PASSPHRASE`, uploaded to Cloudflare R2 (chosen by owner), size verified; optional second target `GATEWAY_DATABASE_URL`; live ledger check after the dump; Telegram on failure) and `db-restore-drill.yml` (weekly into a throwaway Postgres 17 container, or by hand into `SCRATCH_DATABASE_URL`; refuses production URLs and non-empty targets; prints timings). Logic in `infra/scripts/{db-backup,db-restore,install-pg17-client}.sh` and `ledger-check.sql`, the latter covered by `apps/api/src/services/ledger-check.test.ts`. The ledger invariant `sum(balances.credits) = sum(transactions.amount)` holds only because `SIGNUP_BONUS_MICRO_CREDITS = 0`; hand-seeded credits (`seed.ts`) break it by design. Runbook: `docs/runbooks/backup-restore-drill.md` (Supabase tier and RTO cells are the owner's to fill in). Stale `backup-restore.sh` references removed.

### P4.2 Load test (1 session)
- k6 against staging: 50+ concurrent `/chat` streams for several minutes, plus concurrent same-user requests (must hit the P1.2 lock), plus a deploy mid-test (P3.2). Watch DB pool, Redis memory/policy, error rate, job failures.
- **Done when:** no pool exhaustion, no unbounded Redis growth, no unbilled completions, no lost streams beyond the shutdown grace.
- **As built (P4.2):** `infra/loadtest/` (`chat.k6.js`: 60 streaming users plus a same-user scenario that must hit the P1.2 lock with `409 REQUEST_IN_PROGRESS`; `setup.sh` creates `loadtest-%@example.invalid` users with seed-derived API keys and ledger-consistent credits, refuses a database with real users; `reconcile.sql` proves every completed response has exactly one matching `usage_debit`; `teardown.sh`), `.github/workflows/load-test.yml` (setup, k6, before/after `/metrics`, reconcile, P4.1 ledger check, optional teardown; refuses a production DB URL) and `db-ops.yml` gained a guarded `target = staging` input so staging can be migrated from the same button. Tested: `apps/api/src/services/loadtest-reconcile.test.ts`. No staging existed (owner chose to build one): the runbook `docs/runbooks/LOAD_TEST.md` says how. Notes: `transactions.request_id` has no unique constraint, so double billing would not be blocked by the database, only detected here; a mid-test deploy is triggered by the owner by hand.

### P4.3 LAUNCH GATE (1 session)
Nothing new is built. Walk §11 line by line with evidence. Any unticked item is either fixed or explicitly deferred in writing with a reason. **Launch happens after this session, not before.**
- **As walked (P4.3, first pass):** verdict NO-GO. `docs/production/LAUNCH_GATE.md` maps every §11 line to repo evidence and a status, and lists 12 ordered blockers (mostly owner proofs: paid plans, prod migrations 0017-0020, drills, RTO, load test, GitHub settings, business items). Mismatches found: §11 names only migration 0017 (0018-0020 also needed); the repo `decisions.md` still shows ADR-011 as DRAFT. Re-walk when the owner supplies evidence; tick only then.

---

## 10. Stages 5–7 — Capabilities

### Stage 5 — Storage & inputs

**P5.1 Supabase Storage foundation** (1 session) — *L2, L3*
- Private buckets: `attachments` and `audio` (short lifetime). Bucket-level `fileSizeLimit` and `allowedMimeTypes` set as a second enforcement layer. Server-only helper wrapping the service-role key (new required env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, validated in `config.ts`; never exposed to web).
- Signed upload URLs scoped to one object key under `{userId}/{conversationId}/{uuid}`; signed download URLs, short-lived, issued only after an ownership check.
- **Quotas:** per-user total bytes and per-day upload count. **Orphan cleanup:** scheduled job deletes objects never confirmed within 1 h. **Deletion cascade:** deleting a conversation or account deletes its objects (update privacy policy text accordingly). Storage RLS policies deny all direct client access (only the server signs URLs).
- **Tests:** oversized/wrong-type rejected before a URL is issued; a user cannot get a URL for another user's key; cascade deletes objects; cleanup job removes orphans.

- **As built (P5.1):** `services/storage.policy.ts` (buckets, limits, key shape, pre-URL validation), `storage.client.ts` (plain-`fetch` Supabase Storage REST wrapper, no new dependency; service-role key only here and in `config.ts`; `resolveStorageConfig` makes storage optional so a missing/malformed `SUPABASE_*` never stops boot, L12), `storage.service.ts` (`requestUpload` with a per-user advisory lock for quotas, `confirmUpload`, `getDownloadUrl`, `sweep`). New table `storage_objects` (migration `0021`, RLS on). Buckets are created/updated idempotently at api start (non-fatal). `storageSweep` job every 30 min (was 15; Upstash free-plan budget), registered only when storage is configured: removes orphans (>1 h unconfirmed), audio >24 h, and objects of soft-deleted conversations or anonymized accounts. **Deviations from the plan text, deliberate:** (1) deletion cascade is done by the sweep, not by editing the frozen delete routes (latency up to ~30 min); (2) storage RLS is verified by an owner query rather than a policy migration (`storage.*` SQL cannot run in CI's Postgres; no policies = deny); (3) the plan's `attachments` table stays P5.2; P5.1 has its own `storage_objects` for quotas and cleanup; (4) `SUPABASE_*` are optional in `config.ts`, not required. Privacy policy updated. No public endpoint and no API contract change. Runbook: `docs/runbooks/STORAGE.md`.

**P5.2 Attachments: upload + extraction** (2 sessions) — *L10, N4, N5*
- `attachments` table (`id, userId, conversationId, storageKey, mimeType, sizeBytes, kind image|document|audio, status uploading|processing|ready|failed, extractedText, createdAt`). tRPC `attachments.createUploadUrl` and `attachments.confirm` (enqueues extraction).
- `/chat` accepts an **optional** `attachmentIds: string[]` (default absent → old callers unaffected). Server resolves them, verifies ownership, and rejects images sent to a model with `supportsVision=false` with a clear localized error (never silently drop).
- Documents (PDF/docx/txt): BullMQ worker with memory and time limits, truncation to the model's `contextWindow`. **Extracted text is inserted inside a clearly delimited "untrusted document" block** in the prompt, never as system text (prompt-injection defence). Images re-encoded (strip metadata, cap dimensions). Executable/archive types are never allowlisted.
- Uploads are billed in the prompt tokens they add, via the normal ledger (L8).
- **Tests:** oversize, bad mime, foreign attachment id, non-vision model + image, fixture PDF and docx extraction, extraction timeout marks `failed`, old request shape still works.
- **Done when:** a PDF contributes text to the answer and an image is answered correctly on a vision model.

- **As built (P5.2a, session 1 of 2; P5.2 stays UNTICKED until 5.2b):** migration `0022_attachments.sql` + `schema/attachments.ts` (RLS on; `id` IS the `storage_objects.id`, no separate `storageKey`; adds `fileName`, `errorCode`, `extractedChars`, `truncated`, `updatedAt`). `services/attachments.service.ts` + `attachments.policy.ts`; tRPC `attachments.createUploadUrl` / `confirm` / `get` (`routers/attachments.router.ts`; `get` returns a 300-char preview, never the full text). Extraction: `extraction/` (`file-type.ts` real-bytes check, `extract.ts` txt/PDF/DOCX, `extract.worker.ts` + `extraction.runner.ts`: one `worker_threads` thread per file, 256 MB heap cap, 20 s hard timeout, then terminated), job `extractAttachment` on the `reports` queue (1 attempt; a bad file is a `failed` row, not a job failure). New api dependencies `unpdf`, `fflate` (pure JS, no native binaries; no image library yet). `build.mjs` now emits `dist/extract.worker.js` next to `dist/index.js` and `deploy.yml` fails if it is missing from the image. A failed extraction deletes the object at once; the storage sweep clears `extractedText` whenever it removes an object; a stalled `processing` row is failed after 10 min. **Deviations from the plan text, deliberate:** (1) truncation to the model's `contextWindow` moves to 5.2b (the model is unknown at extraction time); 5.2a stores at most 400,000 characters; (2) image re-encoding moves to 5.2b (5.2a only verifies the real bytes); (3) no attachment-to-message link: a follow-up turn sees a file only if the client re-sends `attachmentIds` (5.2b); (4) `storageKey` replaced by `storageObjectId` = `id`. **Open for P6.3:** `attachments.*` works only on the api host (service key is Render-only), so the browser cannot reach it through Vercel's `/api/trpc`; decide between a web proxy route (frozen-zone exception) and calling the api with a Bearer token. Runbook: `docs/runbooks/ATTACHMENTS.md`.

- **As built (P5.2b, session 2 of 2; P5.2 is ticked only after the owner passes `docs/runbooks/ATTACHMENTS.md` section 4b):** `chat.schema.ts` gets optional `attachmentIds` (uuid[], 1-5, unique; requires `conversationId` and a last user turn). `services/chat-attachments.service.ts` resolves them in `streamChat` right after the model lookup and BEFORE the conversation/user-row insert (a rejected request leaves no saved message): ownership, same conversation, `ready`, vision flag (`supportsVision` or category `vision`), image <= 5 MiB, then reads images back from storage and runs `image-sanitize.ts`. Errors are explicit, Arabic, never a silent drop: `ATTACHMENT_NOT_FOUND` 404 (missing / foreign / other conversation look the same), `ATTACHMENT_NOT_READY` 409, `VISION_NOT_SUPPORTED`, `TOO_MANY_ATTACHMENTS`, `ATTACHMENT_UNSUPPORTED` 400. `chat-attachments.policy.ts` (pure): document text goes into the LAST USER message inside an "untrusted document" block (random 24-hex per-request marker, header says data-not-instructions, never system text), after history compaction, so the saved row and any rolling summary never contain the document; text is cut by water-filling to `95% of the window - used - reserve` (reserve = min(model output cap, 8,192, 25% of window)) and the block says when it was shortened; no room -> `CONTEXT_TOO_LONG`. Images go as `image_url` data URLs. `gateway.service.ts` content type is now `string | parts`: token estimate, affordability and the missing-usage billing fallback read text via `contentText` and add **1,600 tokens per image** (flat, conservative, estimate only). Real billing is untouched: it already uses the provider's `prompt_tokens`. **Deviations from the plan text, deliberate:** (1) images are NOT re-encoded: no native library (sharp's prebuilt binaries vs the image's no-native/no-dev-deps checks; pure JS cannot re-encode WebP/GIF). Instead the PNG/JPEG/WebP/GIF containers are parsed and every metadata block is dropped (EXIF incl. GPS, XMP, IPTC, ICC, comments, text chunks; JPEG keeps only a synthetic orientation tag), dimensions are read and capped (8,000 px per side, 40 MP, reject, not resize). Pixel data is passed through untouched: weaker than a re-encode, contained by the 5 MiB cap and by this process never decoding it; revisit if a native-safe option appears. (2) a file is used only in the request that carries its id (no attachment-to-message link, no schema change); a follow-up turn must resend the id and pays the prompt tokens again. (3) chat image cap 5 MiB (bucket stays 20 MiB). **Still open for P6.3:** how the browser reaches `attachments.*` (see P5.2a note), and the client-side context estimate does not know attachment size. Privacy policy (both copies) now says attachment content goes to the provider with the message. Runbook: `docs/runbooks/ATTACHMENTS.md` section 4b.

**P5.3 Mic / voice input** (1 session) — *L9*
- `MediaRecorder` → upload via P5.1 (`kind: audio`) → server calls a Whisper-compatible endpoint via the gateway; billed as a model call using a `models` row with `categories: ["audio","transcription"]`. Runs under the P1.2 lock and the affordability gate (zero balance → rejected before the call). Transcript lands in the composer as **editable text**, never auto-sent. **Audio object deleted right after transcription** (or ≤24 h on failure).
- **As built (P5.3; ticked 2026-10-01, owner passed `docs/runbooks/VOICE.md` section 4):** backend only; the mic button is P6.3. tRPC `voice.createUploadUrl` / `confirm` / `transcribe` (`routers/voice.router.ts`, api host only, like `attachments.*`). `services/transcription.core.ts` (pure orchestration, every side effect injected) + `transcription.service.ts` (wiring) + `transcription.policy.ts` (limits, duration and cost math, response parsing). Flow: speech model row -> audio row -> duration estimate -> **affordability before any download or provider call** -> gateway `POST /v1/audio/transcriptions` (multipart, `response_format=json`) -> bill -> delete the audio. Runs under the P1.2 lock (`withBilledOperationLock`, fail closed). **Billing:** the provider-reported duration when the answer has one (`usage.type = duration` or `duration`), rounded up to whole seconds, minimum 1 s; otherwise our estimate, which is never below the byte-size floor (128 kbps ceiling; WAV and MP3 have their own) nor below the client-declared duration, and is capped by an 8 kbps ceiling. Nothing is billed on provider failure, 429, timeout or a garbage answer (audio kept for a retry; an undecodable file is deleted). If the final deduction is refused the transcript is withheld. Silence is billed. 5-minute cap, 15 MiB per voice note. **Deviations from the plan text, deliberate:** (1) the speech model is found by the `transcription` category in `models.categories`, but it is **set by SQL**, not in the admin form: `MODEL_CATEGORY_KEYS` is a `Record` key in the web icon map and the form filters categories to known keys, so adding a key means web edits I cannot type-check here. `models.publish` now preserves an existing marker, `models.list` hides marked models and `/chat` answers `404 MODEL_NOT_FOUND` for them. (2) No migration: a speech model's price reuses `wholesale_cost_input_per_m` with the unit **USD per 1M audio SECONDS** (whisper-1 $0.006/min = 100; USD per minute x 16,667); a price under 5 is refused as probably a token price. The admin form still labels it "tokens"; relabel it in a later admin-UI session. (3) Voice notes belong to no conversation (`storage_objects.conversation_id` NULL, key segment all zeros) so the mic works in a brand-new chat; the P5.1 sweep's "no conversation" rule no longer applies to the `audio` bucket (the 24 h audio rule does), and voice notes have their own daily cap of 100 (attachments stay 30). (4) `transactions` token columns stay empty for transcription; the description is `Transcription (Ns)`. **Not built:** live Web Speech preview (L9 optional), streaming transcription, per-language tuning. **Open for P6.3:** how the browser reaches `voice.*` (same decision as `attachments.*`), and the mic button with MediaRecorder, which must send `durationMs`. Runbook: `docs/runbooks/VOICE.md`.
- **Tests:** fixture clip transcribes and bills; zero-balance user rejected pre-call; audio deleted after success.

### Stage 6 — Structured streaming

*Land B.1 together with the frontend plan's chat-core phase; never while the old UI is the only `/chat` consumer without version negotiation.*

**P6.1 Protocol + backend emission** (1–2 sessions) — *L7*
- Shared types in `packages/types`: `message_start`, `content_block_start{index,type: text|thinking|tool_use|tool_result|attachment_ref}`, `content_block_delta`, `content_block_stop`, `message_delta{usage:{inputTokens,outputTokens,creditCost}}`, `message_stop`, `error{code,message}`. `gateway.service.ts` emits v2 only when `Accept: application/vnd.aip.stream+v2`; otherwise the current plain-text stream is unchanged.
- **Tests:** multi-block responses have correct boundaries; partial-stream billing fires exactly once regardless of open blocks; v1 output byte-identical to today.
- **As built (P6.1; UNTICKED until CI is green and the owner runs the curl check in `docs/PR_NOTES.md` Session 44):** types `packages/types/src/stream.types.ts` (type-only; the web build does not transpile that package). `services/stream-v2.ts` (pure): `negotiateStreamVersion(accept)` (v2 only for the exact media type with q > 0), `formatStreamEvent`, `StreamV2Writer` (message_start once, one open block, `finish()` closes the block then sends `message_delta` and `message_stop` exactly once, later calls are no-ops, a throwing write never escapes). `gateway.service.ts` takes `streamVersion`; v1 writes the same raw deltas as before, v2 wraps them. The response is now ended after the pure token-fallback and cost math (so the v2 tail can carry usage) instead of before it; billing and message saving are unchanged and still run after `end()`, once, with the same `cost`. `index.ts` passes `negotiateStreamVersion(req.headers.accept)`. Wire format: SSE `event:` + `data:` frames, Anthropic-Messages style with camelCase fields as in this plan; `error{code,message}` is flat. **Deviations from the plan text, deliberate:** (1) P6.1 emits text blocks only (thinking/tool_use come with P6.2, the types already exist); (2) an interrupted upstream sends `error STREAM_INTERRUPTED` and then the normal tail with `stopReason: "interrupted"`, so `message_stop` is always last; (3) **frozen-zone exception, owner-delegated 2026-10-01:** `apps/web/app/api/chat/route.ts` forwards `Accept` upstream only for the exact v2 media type (the proxy built its headers from an explicit list, so a browser could never negotiate v2); the negotiation is duplicated there on purpose because `@ai-platform/types` is type-only and not transpiled for web. Nothing else in `apps/web` changed. Default behaviour for every existing caller is unchanged. Contract: `docs/frontend/API_CONTRACT.md` section 3.

**P6.2 Provider normalization** (1 session)
- `delta.content` → text; `delta.reasoning_content` → thinking; `delta.tool_calls` → tool_use with streamed JSON args. For providers that hide reasoning, emit an honest coarse `status` event after ~2 s of silence, never faked as reasoning.
- **Tests:** one fixture per upstream shape.

- **As built (P6.2; UNTICKED until CI is green and the owner runs the check in `docs/PR_NOTES.md` Session 45):** `services/stream-normalize.ts` (pure `StreamNormalizer`, `STATUS_AFTER_MS = 2000`): `delta.content` -> text; `delta.reasoning_content` (or the OpenRouter alias `delta.reasoning`) -> thinking; `delta.tool_calls` -> one `tool_use` block per call (id + name on the first fragment, `input_json_delta` for the rest, parallel calls by `index` or by a new `id`, a synthetic id when the provider sends none). `StreamV2Writer` gained `thinking`, `toolStart`, `toolArgs` (refuses a fragment whose block is no longer open) and `status`. `stream.types.ts`: `status` event, `StreamStatusCode = "waiting"`, stop reason `"tool_use"` (used when the upstream `finish_reason` is `tool_calls`). `gateway.service.ts`: only the v2 branch uses the normalizer (v1 still reads `delta.content` itself); a 2 s silence timer sends one `status waiting` if no output arrived, and is cleared on the first output and in the read-loop `finally`. Billing: in v2 the usage fallback estimate and the partial-answer check also count reasoning text and tool-call arguments; the saved `content` stays text only (P6.4 persists blocks). **Deviations from the plan text, deliberate:** (1) the request never sends `tools` or asks for reasoning, so `tool_use` can only occur if the gateway returns it unasked; the mapping is fixture-tested groundwork, no tool runs; (2) `status` can only fire after the provider's response headers arrive, silence before that is unchanged; (3) a tool-call fragment for a call that a later block already closed is dropped and counted (`droppedToolFragments`), because the protocol allows one open block. Contract: `docs/frontend/API_CONTRACT.md` section 3.

**P6.3 Frontend renderer** (with frontend plan chat-core) — thinking accordion, tool chips, status line. Contract defined here; UI lives in `apps/web`.

**P6.4 Persist structured messages** (1 session)
- Add `messages.contentBlocks jsonb` (source of truth); keep `content text` as the flattened projection for search/export. No backfill: old rows render as one text block.
- **Tests:** thinking + tool_use + text round-trip; flat `content` equals concatenated text blocks.

**P6.5 Tool-call groundwork** (1 session; added after P6.2, before any tool loop)
- Measure before building: `scripts/gateway-tool-spike.mjs` runs four probes per model against the gateway (tool call, parallel tools, reasoning default, reasoning effort) and reports what comes back and under which field names. Reuse the existing admin `categories` flags `functionCalling` and `reasoning` (no new column); a pure helper `modelSupportsTools` / `modelSupportsReasoning` reads them. `/chat` still never sends `tools`.
- **As built (P6.5; UNTICKED until the owner runs the spike and reports the output):** `scripts/gateway-tool-spike.mjs` (+ `.test.mjs`, run with `node --test scripts/gateway-tool-spike.test.mjs`, not in CI), `apps/api/src/services/model-capabilities.ts` (+ test), runbook `docs/runbooks/TOOL_SPIKE.md`. **Deviation from the earlier suggestion, deliberate:** no `supportsTools` / `supportsReasoning` columns: `categories` already has those keys, an admin toggle and forward-compatible handling. A flag is an admin claim backed by the spike; nothing sets it automatically. **Next (not scheduled):** after P6.4 (persist blocks), a tool registry + server tool loop (max steps, per-tool timeout, per-turn credit ceiling, every round trip billed, tool output treated as untrusted), then `web_search` / `web_fetch` through the P7.2 egress proxy.

### Stage 7 — Agents (gated: Stage 4 signed off, Stages 5–6 stable)
Scope in detail only when you get here.
- **P7.1** `apps/agent-runtime`: separate deployable, own queue namespace and Redis prefix, called from api with the internal token, never from a public route. `sandbox_sessions` table; idle TTL and hard wall-clock cap; provider chosen by a short spike (L11); teardown verified provider-side.
- **P7.2** Tools: `code_execution` (no network), `web_search`/`web_fetch` through one mediated egress proxy with allow/deny lists and internal-range blocking (red-team: `169.254.169.254`, internal hostnames, odd ports must fail), `file_read`/`file_write` scoped to the conversation's storage prefix. All are ordinary blocks in the P6 protocol.
- **P7.3** Billing (sandbox-seconds + per-call fee, same `credits` currency), per-user daily and concurrent quotas, sandbox signals fed into `fraud.service` and the existing admin fraud queue.
- **P7.4** Run UI: tool cards, approval step before side-effecting tools, artifacts panel via Supabase Storage.

---

## 11. Launch gate checklist (this replaces the old `LAUNCH_CHECKLIST.md` body)

**Access & money**
- [ ] Suspended/flagged user is locked out on REST + tRPC, cookie + API key (P1.1 tests green)
- [ ] Sessions revoked on suspend; no self-suspend; admin cannot suspend superadmin
- [ ] Concurrent same-user requests rejected before provider call (P1.2), tested on real Redis
- [ ] Ledger invariant holds after load test (sum of transactions = sum of balances)
- [ ] Rate limit/fraud identity cannot be forged by headers (P1.3)
- [ ] Migration 0017 applied in prod; the RLS query returns zero rows (N10)

**Visibility**
- [ ] Sentry live on web and api; PII scrubbed
- [ ] Telegram receives: app alerts, Sentry alerts, uptime alerts, deploy-fail (each drilled once)
- [ ] Redis `noeviction` confirmed; job retention live; failed-job metric and alert working

**Infrastructure**
- [ ] ADR-011 accepted (no ⬜ left); gateway reachable only from the api or protected as the plan requires; Redis private
- [ ] Upstash on a paid plan (L15); Vercel on Pro (L16); Render api + gateway on paid instances (L17); both Supabase projects on Pro with a backup taken and a restore tried (L18)
- [ ] `/metrics` no longer public (N9)
- [ ] Graceful shutdown verified with a mid-stream deploy
- [ ] Container non-root, compiled, healthcheck
- [ ] Secret-rotation runbook rehearsed once

**Security**
- [ ] CORS, headers, body limits, Zod limits, admin 2FA enforced, Turnstile live
- [ ] Dependabot + audit + secret scanning + branch protection on
- [ ] Provider-cost guard alerting

**Recovery**
- [ ] Supabase backup tier documented; independent nightly export running
- [ ] Restore drill done; RTO recorded

**Business & legal (from the old checklist, kept)**
- [ ] Legal entity and bank account; jurisdiction filled in ToS/Privacy/AUP; lawyer review
- [ ] Production domain, SPF/DKIM/DMARC, support@/privacy@/abuse@/noreply@
- [ ] Jaib voucher stock loaded; manual-transfer wallet details set in admin
- [ ] Cookie consent (if serving EU); announcement channel ready

**Product**
- [ ] Register → verify email → login tested; redeem end-to-end; manual claim → approve end-to-end
- [ ] 3+ models chatted with, balances deducted correctly
- [ ] Load test passed (P4.2)

---

## 12. Cross-plan rules
- **Frontend plan:** its "Backend B1 — chat contract" note is superseded by Stage 6 here. Its Phase 4 (chat core) is the frontend half of P6.3; run them as a pair. Its D8 (screenshot upload) is closed as *won't do* (L3).
- **Hardening before features:** Stages 5–7 never start before the Stage 4 gate is signed.
- **Every alert** gets a runbook line; every runbook is linked from where the alert is defined.
- **Env additions** (all validated in `config.ts`, all server-side): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN` (api), `TELEGRAM_*` (already present). **Removed:** all `MINIO_*`.

---

## Appendix — Triage if time is short
If you can only do part before launch, do them in this order and do not skip any of the first six: **P1.1 → P1.2 → P0.1 → P2.3 (Redis policy) → P1.3 → P2.1 → P2.2 → P3.2 → P4.1 → P3.1 → P4.2 → P4.3.** P3.3–P3.6 can trail launch by days, not weeks.
