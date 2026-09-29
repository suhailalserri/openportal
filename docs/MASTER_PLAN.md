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
STAGE 6  Streaming           P6.1 protocol · P6.2 normalization · P6.3 UI · P6.4 persistence
STAGE 7  Agents (gated)      P7.1 runtime · P7.2 tools + egress · P7.3 billing/fraud · P7.4 UI
```

Total before launch: **~15 sessions**. Stage 5–6: **~9**. Stage 7: scope again when you get there.

---

## 4. Progress tracker

**Stage 0** — [x] P0.1 · [x] P0.2
**Stage 1** — [x] P1.1 · [x] P1.2 · [x] P1.3
**Stage 2** — [x] P2.1 · [ ] P2.2 · [ ] P2.3 (code done, awaiting owner drill: docs/runbooks/REDIS_POLICY.md)
**Stage 3** — [ ] P3.1 · [ ] P3.2 · [ ] P3.3 · [ ] P3.4 · [ ] P3.5 · [ ] P3.6
**Stage 4** — [ ] P4.1 · [ ] P4.2 · [ ] P4.3 **← LAUNCH GATE**
**Stage 5** — [ ] P5.1 · [ ] P5.2 · [ ] P5.3
**Stage 6** — [ ] P6.1 · [ ] P6.2 · [ ] P6.3 · [ ] P6.4
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
- **Tests:** two limiter instances sharing one Redis count against one budget; window rolls over correctly.

### P3.2 Graceful shutdown + health/readiness (1 session)
**Closes:** N2.
- On `SIGTERM`: stop accepting new requests, let in-flight streams finish (bounded, e.g. 60–90 s) so billing completes, then close DB/Redis/workers. Set Render's shutdown grace period to match. Split `/health` (liveness) from `/ready` (DB + Redis reachable). Confirm the partial-stream billing path also fires if the process is force-killed at the deadline.
- **Tests:** an in-flight stream during shutdown is billed exactly once.

### P3.3 Container hardening (1 session)
**Closes:** G8.
- Multi-stage build; runtime runs compiled `dist` with production deps only; `USER node`; `HEALTHCHECK` hitting `/health`; pinned base image digest.
- **Done when:** `docker inspect` shows non-root, no `tsx`/dev deps in the final image, and the app boots.

### P3.4 Secrets & rotation (1 session)
**Closes:** G12.
- `docs/runbooks/secret-rotation.md` for each secret in `config.ts` plus Supabase service-role key, Sentry DSN, Telegram token, `INTERNAL_SERVICE_TOKEN` (shared by web and api, so rotate both in order with a short overlap window or accept brief 401s), `BETTER_AUTH_SECRET` (invalidates every session, announce first), `CODE_SALT` (invalidates unredeemed issued codes; check `codeInventory` first). Rehearse one rotation (`INTERNAL_SERVICE_TOKEN`) on staging.
- Enable GitHub secret scanning + push protection.

### P3.5 Security sweep (1 session)
**Closes:** N6.
- Verify/fix: CORS allow-list (web origin only); security headers on api; request body size limit on `/chat` and tRPC; Zod limits on every free-text field; admin/superadmin **must have 2FA** enabled to use admin procedures; login/registration rate limits and Turnstile confirmed live; Dependabot + `pnpm audit` in CI failing on high severity; branch protection on `main` (required `api-tests`, `web-build`); logs contain no message content or tokens.
- **Done when:** each item has a test or a screenshot/config note in the PR.

### P3.6 Provider-cost guard (1 session)
**Closes:** N7.
- Turn `infra/scripts/price-audit.ts` into a scheduled job: for every active model, compare `sellPrice` to gateway cost × required margin; alert (Telegram) if any model sells below cost or a provider price changed. Add a daily "revenue vs upstream cost" number to the admin dashboard.
- **Done when:** editing a model price below cost triggers an alert in a test.

---

## 9. Stage 4 — Recovery & launch gate

### P4.1 Backup and restore drill (1 session)
**Closes:** G11. **Depends:** P0.1.
- Confirm what Supabase's plan gives (daily backup retention, PITR yes/no) and record it. Add an **independent** nightly export (extend the existing `db-ops.yml` GitHub Action) to storage outside Supabase. `docs/runbooks/backup-restore-drill.md`: exact commands to restore into a scratch DB, plus a verification checklist (`users` count, `balances` sum, latest `transactions` timestamp, ledger invariant: sum of transactions = sum of balances).
- **Done when:** the drill has been run for real once, passed, and the wall-clock time is written into the runbook as your RTO.

### P4.2 Load test (1 session)
- k6 against staging: 50+ concurrent `/chat` streams for several minutes, plus concurrent same-user requests (must hit the P1.2 lock), plus a deploy mid-test (P3.2). Watch DB pool, Redis memory/policy, error rate, job failures.
- **Done when:** no pool exhaustion, no unbounded Redis growth, no unbilled completions, no lost streams beyond the shutdown grace.

### P4.3 LAUNCH GATE (1 session)
Nothing new is built. Walk §11 line by line with evidence. Any unticked item is either fixed or explicitly deferred in writing with a reason. **Launch happens after this session, not before.**

---

## 10. Stages 5–7 — Capabilities

### Stage 5 — Storage & inputs

**P5.1 Supabase Storage foundation** (1 session) — *L2, L3*
- Private buckets: `attachments` and `audio` (short lifetime). Bucket-level `fileSizeLimit` and `allowedMimeTypes` set as a second enforcement layer. Server-only helper wrapping the service-role key (new required env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, validated in `config.ts`; never exposed to web).
- Signed upload URLs scoped to one object key under `{userId}/{conversationId}/{uuid}`; signed download URLs, short-lived, issued only after an ownership check.
- **Quotas:** per-user total bytes and per-day upload count. **Orphan cleanup:** scheduled job deletes objects never confirmed within 1 h. **Deletion cascade:** deleting a conversation or account deletes its objects (update privacy policy text accordingly). Storage RLS policies deny all direct client access (only the server signs URLs).
- **Tests:** oversized/wrong-type rejected before a URL is issued; a user cannot get a URL for another user's key; cascade deletes objects; cleanup job removes orphans.

**P5.2 Attachments: upload + extraction** (2 sessions) — *L10, N4, N5*
- `attachments` table (`id, userId, conversationId, storageKey, mimeType, sizeBytes, kind image|document|audio, status uploading|processing|ready|failed, extractedText, createdAt`). tRPC `attachments.createUploadUrl` and `attachments.confirm` (enqueues extraction).
- `/chat` accepts an **optional** `attachmentIds: string[]` (default absent → old callers unaffected). Server resolves them, verifies ownership, and rejects images sent to a model with `supportsVision=false` with a clear localized error (never silently drop).
- Documents (PDF/docx/txt): BullMQ worker with memory and time limits, truncation to the model's `contextWindow`. **Extracted text is inserted inside a clearly delimited "untrusted document" block** in the prompt, never as system text (prompt-injection defence). Images re-encoded (strip metadata, cap dimensions). Executable/archive types are never allowlisted.
- Uploads are billed in the prompt tokens they add, via the normal ledger (L8).
- **Tests:** oversize, bad mime, foreign attachment id, non-vision model + image, fixture PDF and docx extraction, extraction timeout marks `failed`, old request shape still works.
- **Done when:** a PDF contributes text to the answer and an image is answered correctly on a vision model.

**P5.3 Mic / voice input** (1 session) — *L9*
- `MediaRecorder` → upload via P5.1 (`kind: audio`) → server calls a Whisper-compatible endpoint via the gateway; billed as a model call using a `models` row with `categories: ["audio","transcription"]`. Runs under the P1.2 lock and the affordability gate (zero balance → rejected before the call). Transcript lands in the composer as **editable text**, never auto-sent. **Audio object deleted right after transcription** (or ≤24 h on failure).
- **Tests:** fixture clip transcribes and bills; zero-balance user rejected pre-call; audio deleted after success.

### Stage 6 — Structured streaming

*Land B.1 together with the frontend plan's chat-core phase; never while the old UI is the only `/chat` consumer without version negotiation.*

**P6.1 Protocol + backend emission** (1–2 sessions) — *L7*
- Shared types in `packages/types`: `message_start`, `content_block_start{index,type: text|thinking|tool_use|tool_result|attachment_ref}`, `content_block_delta`, `content_block_stop`, `message_delta{usage:{inputTokens,outputTokens,creditCost}}`, `message_stop`, `error{code,message}`. `gateway.service.ts` emits v2 only when `Accept: application/vnd.aip.stream+v2`; otherwise the current plain-text stream is unchanged.
- **Tests:** multi-block responses have correct boundaries; partial-stream billing fires exactly once regardless of open blocks; v1 output byte-identical to today.

**P6.2 Provider normalization** (1 session)
- `delta.content` → text; `delta.reasoning_content` → thinking; `delta.tool_calls` → tool_use with streamed JSON args. For providers that hide reasoning, emit an honest coarse `status` event after ~2 s of silence, never faked as reasoning.
- **Tests:** one fixture per upstream shape.

**P6.3 Frontend renderer** (with frontend plan chat-core) — thinking accordion, tool chips, status line. Contract defined here; UI lives in `apps/web`.

**P6.4 Persist structured messages** (1 session)
- Add `messages.contentBlocks jsonb` (source of truth); keep `content text` as the flattened projection for search/export. No backfill: old rows render as one text block.
- **Tests:** thinking + tool_use + text round-trip; flat `content` equals concatenated text blocks.

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
