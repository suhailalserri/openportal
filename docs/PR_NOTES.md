# P1.1 — Account guard + admin protections

Plan: `docs/MASTER_PLAN.md` §6 P1.1 (closes G2, G2b). No frozen file was edited.

## What changed

- `apps/api/src/utils/account-guard.ts` (new, pure): `assertUsableAccount(user)`
  returns `{ok:true}` or `{ok:false, reason:"suspended"|"fraud_flagged"}`. Any
  `status !== "active"` counts as suspended, matching what the REST paths
  already did.
- `auth.middleware.ts`: all three paths (internal token, **session cookie**,
  API key) go through one helper. The cookie path had no check before.
- `routers/trpc.ts`: `protectedProcedure` and `adminProcedure` throw `FORBIDDEN`
  with message `ACCOUNT_SUSPENDED` / `ACCOUNT_UNDER_REVIEW`. Because
  `apps/web/server/context.ts` feeds the same `appRouter`, this covers the
  Next.js tRPC handler and caller too.
- `admin.updateUserStatus`: one transaction. Rejects self (`CANNOT_MODIFY_SELF`),
  unknown user (`NOT_FOUND`), and a non-superadmin targeting an admin or
  superadmin (`INSUFFICIENT_ROLE_FOR_TARGET`). Suspending deletes the user's
  `sessions` rows. Audit row now records `before.status` and `sessionsRevoked`.
- `fraud.service.ts`: a critical event flags the user **and** revokes sessions.
- Migration `0018_revoke_sessions_on_lockout.sql`: trigger that deletes a user's
  sessions on the transition into `suspended` or `is_fraud_flagged = true`.
  Backstop for writers outside `apps/api`. Added to `deploy.yml` and
  `db-ops.yml` lists; `db:migrate:manual` discovers it by filename.

## External contract

- REST bodies unchanged (`Account suspended`, `Account under review`).
- **New tRPC error messages** (additive; previously these calls succeeded):
  `ACCOUNT_SUSPENDED`, `ACCOUNT_UNDER_REVIEW`, `CANNOT_MODIFY_SELF`,
  `USER_NOT_FOUND`, `INSUFFICIENT_ROLE_FOR_TARGET`. `docs/frontend/API_CONTRACT.md`
  should list them; the frontend does not map them yet (follow-up).

## Follow-up: frozen-zone edits (owner-approved 2026-09-29)

The owner approved closing the frozen-route gaps now. These files under
`apps/web` were edited on purpose; every edit is listed here.

- `apps/web/lib/account-guard-server.ts` (**new**): `rejectUnusableAccount(userId)`
  reads the user row and applies the shared `assertUsableAccount`. Returns
  `null` or a 403 `{ error, code }`; a missing user is 401; a DB error
  propagates (fail closed).
- 19 route files, 24 handlers under `apps/web/app/api/**`: each got the same
  import plus two lines right after its existing session check
  (`const lockedAccount = await rejectUnusableAccount(session.user.id); if (lockedAccount) return lockedAccount;`).
  Nothing else in those files changed except the PATCH route below.
  Files: admin/{codes,fraud,fraud/[id]/resolve,logs,stats,users,users/[id],users/[id]/credits},
  balance, chat, conversations, conversations/[id], redeem, transactions,
  usage/export, user/{delete-account,export-data,sessions,sessions/[id]}.
- `apps/web/app/api/admin/users/[id]/route.ts` PATCH: no longer writes
  `users.status` itself. It calls `applyUserStatusChange`
  (`apps/api/src/services/user-status.service.ts`), the same code the tRPC
  mutation now uses: no self-suspend, superadmin protection, 404, session
  revocation, audit row. Bad JSON or a non-UUID id is now 400 (was a 500 or
  an unhandled throw).
- `apps/web/lib/auth.ts`: `session.cookieCache` **disabled** (was 5 min).
  Trade-off: one session lookup per `getSession` call. If P4.2 shows it hurts,
  restore a short `maxAge` (about 30 s), not 5 min.
- `apps/api/package.json`: two new `exports` entries
  (`./utils/account-guard`, `./services/user-status`).

Behaviour changes to be aware of:

- A suspended or fraud-flagged user now gets 403 on every one of those routes,
  including `user/export-data` and `user/delete-account`. They must go through
  support for those. Say so if you want those two exempted.
- The 403 body is `{ error: "Account suspended" | "Account under review", code }`.
  `code` is new and additive.
- `audit_logs.ip` is now stored as NULL when the caller's IP is not a single
  valid address (previously a value like `unknown` made the insert throw).
- P1.3 will replace the raw `x-forwarded-for` read in the PATCH route with the
  shared `getClientIp()`.

Still open after this:

- A suspended user can still log in and get a session row. Every surface now
  refuses it, but blocking creation (`databaseHooks.session.create.before`) was
  not done: it needs a better-auth hook signature I cannot verify here, and a
  blocked login gives the user a generic error instead of the "suspended" copy.
- The frontend does not map `ACCOUNT_SUSPENDED` / `ACCOUNT_UNDER_REVIEW` yet.
- `docs/frontend/API_CONTRACT.md` should list the new codes.

---

# Backend PR — Delete-account 2FA gate

Split out of Phase 7.2 (Settings: preferences, API access, referral,
privacy) because it touches `apps/web/app/api/**`, which
`docs/FRONTEND_REBUILD_PLAN.md`'s frozen zone (§4) reserves for
backend-track (§7) sessions only. This PR targets `main` directly, on
its own branch, independent of `frontend-v2`.

## What changed

`apps/web/app/api/user/delete-account/route.ts`: if the account has
2FA enabled (`users.twoFactorEnabled`), deletion now also requires a
valid TOTP or backup code in the request body's `twoFactorCode`,
checked via better-auth's own `auth.api.verifyTOTP` /
`auth.api.verifyBackupCode` — the same server-side primitives
`two-factor-section.tsx` already drives client-side through
`authClient.twoFactor.*`. A non-2FA account's flow is byte-identical
to before.

New error responses (400): `TWO_FACTOR_REQUIRED` (code omitted),
`INVALID_TWO_FACTOR_CODE` (code present but wrong). Existing responses
(`PASSWORD_REQUIRED`, `INCORRECT_PASSWORD`, `CONFIRMATION_REQUIRED`,
`TOO_MANY_ATTEMPTS`) are unchanged.

This closes the gap in the plan's own §6 Phase 7.2 text: "delete
account (password confirm; 2FA code if enabled)."

## Compatibility with the frontend

The Phase 7.2 frontend PR (`features/settings/sections/data-privacy/
delete-account-dialog.tsx`) already handles both new error codes and
was written/shipped independent of this PR's merge order:
- Deployed against today's (unpatched) route: a 2FA-enabled account
  deletes on password alone — no error, no crash, same as every
  account before Phase 7.2.
- Once this PR merges: the already-shipped frontend picks up the 2FA
  step automatically, no frontend redeploy needed.

Merge either order; no coordination required beyond this note.

## Not verified

Better-auth's exact `verifyTOTP` / `verifyBackupCode` server-side
export names and error shape on the installed version — this sandbox
has no network/`node_modules` to import better-auth and confirm
against the real package. The client-side calls this mirrors
(`authClient.twoFactor.verifyTotp` / `verifyBackupCode`) are real and
already in use elsewhere in this codebase, but the *server-side*
`auth.api.*` names are inferred from better-auth's usual client/server
naming symmetry, not confirmed against source. If either name is
wrong, it's a one-line fix in the route (it fails loudly — a wrong
method name throws at call time, not silently) and the two `catch`
blocks already narrow on `APIError` only, so anything else (e.g. a
`TypeError` from calling a nonexistent method) will surface immediately
in CI/preview rather than being swallowed as "invalid code."

## How to verify

- `apps/api`'s Testcontainers suite doesn't cover this route (it's a
  Next.js route handler in `apps/web`, not a tRPC procedure) — add a
  route-level integration test if this codebase has a harness for
  `apps/web` API routes; otherwise this needs a live preview pass:
  - Non-2FA throwaway account: delete-account completes on password
    alone (regression check — must still work exactly as before).
  - 2FA-enabled throwaway account: submitting only a password returns
    `TWO_FACTOR_REQUIRED`; a wrong TOTP/backup code returns
    `INVALID_TWO_FACTOR_CODE`; a correct one completes the deletion and
    signs the session out.
  - Confirm the deleted 2FA account's `twoFactor` row is actually gone
    (existing anonymization transaction already deletes it — verify
    that still runs after the new check, not bypassed by an early
    return).


---

# P1.2 — Per-user in-flight billing lock (closes G5)

Plan: `docs/MASTER_PLAN.md` §6 P1.2. **No frozen file was edited.** The lock lives
in `apps/api` (`index.ts` `/chat`), not in the frozen `apps/web` proxy.

## Changes

- New `apps/api/src/services/billing-lock.service.ts` — `withBilledOperationLock(userId, fn, opts?)`
  (reusable by transcription/agents), `replyForLockError()`, error classes.
- `apps/api/src/index.ts` — `/chat` wraps `streamChat` in the lock (after auth, rate limit and the
  DB-only zero-balance check; before `streamChat`'s idempotency claim). Passes `requestId` down.
- `apps/api/src/services/gateway.service.ts` — optional `requestId` option (`opts.requestId ?? randomUUID()`);
  comment on G5 updated. No behaviour change without the option.
- `apps/api/src/metrics.ts` — `aip_billing_lock_rejected_total`, `aip_billing_lock_unavailable_total`,
  `aip_billing_lock_lost_total`.
- `.github/workflows/deploy.yml` — `api-tests` gets a `redis:7-alpine` service container + `TEST_REDIS_URL`.
- Tests: `billing-lock.service.test.ts` (real Redis), one case in `gateway.service.test.ts`.

## External contract change (`docs/frontend/API_CONTRACT.md` updated)

`POST /chat` (and the web proxy that streams it through) can now return:
- `409 REQUEST_IN_PROGRESS` — `retryable: true`, `retryAfterSeconds: 2`, header `Retry-After: 2`.
- `503 SERVICE_TEMPORARILY_UNAVAILABLE` — lock store down (fail closed), `Retry-After: 5`.

**Frontend (closed in Session 11):** `features/chat/lib/stream-reader.ts` now retries 409
`REQUEST_IN_PROGRESS` up to 3 times and 503 `SERVICE_TEMPORARILY_UNAVAILABLE` once, waiting the body's
`retryAfterSeconds` (clamped 1-10 s; the frozen proxy drops the `Retry-After` header, so the body is
the source). The identical body is resent. Stop during the wait reports `stopped`. After the last
attempt the server's own message is shown with the normal retry button. **Correction to Session 10:**
the web client does not send `clientMessageId` at all today (grep of `apps/web`: zero hits), so the
"retry with the same `clientMessageId`" wording in Session 10 described the API contract, not the
current client. It is safe here anyway: a 409/503 is returned before any row is written.

## Behaviour to know

- A follow-up sent in the few ms between stream end and deduction commit gets a 409 (by design).
- Retrying the same `clientMessageId` while the first request still runs gets a 409; after release the
  retry proceeds and the idempotency claim prevents a duplicate user row.
- Lock lost mid-stream (heartbeat sees another owner or none): logged + counted, stream is **not**
  aborted; billing stays atomic (`WHERE credits >= X`). Say so if abort is preferred.
- If Stop / tab close does not reach the API through the Vercel proxy (proxy is frozen and does not
  forward `req.signal`; unverified), the API keeps streaming and holds the lock up to the 120 s stream
  ceiling. Logged, not fixed.
- Upstash budget (L15): +2 commands per chat (SET, release EVAL) and +1 per 10 s of streaming (heartbeat).

## Ops

- Stuck lock: `redis-cli DEL lock:billed:<userId>`. Self-heals in 30 s if the holder died.
- Alert: on the first 503 in each 5-minute window a critical alert is queued (best effort; the alert
  queue is on the same Redis, so during a full outage it may not deliver — P2.2 adds the external
  uptime check that covers this).


---

## Session 11 - P1.2 follow-up: frontend 409/503 handling + two CI fixes

- `apps/web/features/chat/lib/stream-reader.ts` - bounded auto-retry (above); new export
  `autoRetryDelayMs`; optional 4th argument `{ sleep }` as a test seam. Existing callers unchanged.
- `apps/web/features/chat/lib/stream-reader.test.ts` - 9 added cases (delay clamping, success after
  a busy reply with identical body, give-up after 3, 503 once, no retry on mismatched status/code or
  on 402, Stop while waiting, real sleep aborts).
- `apps/web/lib/account-guard-server.test.ts` - the "DB error propagates" case now throws
  synchronously inside the mock and asserts with try/catch (was failing in CI: `Error: db down` at
  the mock's throw line). Production code untouched.
- `.github/workflows/deploy.yml` - `Build apps/web` in `web-build` and `e2e` retried up to 3 times
  (15 s / 30 s pauses) for the transient `next/font/google` failure.
- No frozen-zone edits (`app/api/**`, `lib/auth.ts` untouched).

---

## Session 12 - P1.3 client-IP trust chain (closes G10 for the api and the two approved web routes)

**New:** `apps/api/src/utils/client-ip.ts` (pure, exported as `@ai-platform/api/utils/client-ip`),
`client-ip.test.ts`, `apps/web/app/api/chat/route.test.ts`.
**Changed:** `apps/api/src/index.ts` (`trustProxy` from `TRUSTED_PROXY_HOPS`, default 1),
`middleware/rateLimit.middleware.ts`, `routers/trpc.ts` (both now call `resolveApiClientIp`),
`apps/api/package.json` (export), `.env.example`, `docs/frontend/API_CONTRACT.md`,
`docs/MASTER_PLAN.md` (P1.2 ticked).
**Frozen zone, owner-approved:** `apps/web/app/api/chat/route.ts` (adds `X-Client-IP` from
`resolveWebClientIp`; omitted when no valid IP), `apps/web/app/api/admin/users/[id]/route.ts`
(audit `ip` now from the same resolver instead of raw `x-forwarded-for`).

**Trust rules:** api believes `X-Client-IP` only when the request carried the internal token;
`x-forwarded-for` is never read on the api; `cf-connecting-ip` only while `TRUST_CF_CONNECTING_IP`
is not `false`; otherwise Fastify `request.ip` (trustProxy). Web reads only Vercel-set headers on
Vercel (docs: Vercel overwrites `x-forwarded-for`, `x-real-ip` and `x-vercel-forwarded-for` with the
client IP) and never `cf-connecting-ip`.

### Second round (owner approved the two remaining frozen edits)
- `apps/web/server/context.ts`: `ctx.ip` now `resolveWebClientIp(...) ?? "unknown"`.
- `apps/web/lib/turnstile-server.ts`: `getClientIp` delegates to `resolveWebClientIp`; the call sites in
  `lib/auth.ts` and `app/api/redeem/route.ts` are untouched.
- No `cf-connecting-ip` read remains on the web side. The only remaining read is in the api, behind
  `TRUST_CF_CONNECTING_IP`.
- CI fixes: `trustProxy` now takes a function (`trustProxyByHops`) because this Fastify version's types
  reject a number (TS2769; it also cascaded into two TS2379 errors at `index.ts` 80/82). The
  trustProxy inject test no longer pins one value.

### Behaviour to know
- Rate-limit and fraud keys change identity (Vercel IP -> real client IP). Existing per-IP counters
  simply stop matching; no migration.
- Off Vercel (dev, CI/E2E) the web side reads `x-forwarded-for` so specs can choose identities. Do not
  self-host `apps/web` on the open internet without a proxy you control.
- Internal-token requests with no valid `X-Client-IP` fall back to the old behaviour (Vercel's IP).


## Session 13 - P2.1 Backend error tracking (closes G3)

Plan: `docs/MASTER_PLAN.md` §7 P2.1. Decisions L5 (Sentry), L12 (fail open), L14 (shared list).

### What changed
- **One scrub list.** `packages/config/src/monitoring-scrub.ts` (new, pure, subpath export
  `@ai-platform/config/monitoring-scrub`) holds `redactText`, `scrubUrl`, `shouldIgnoreError`,
  `IGNORED_TRPC_CODES`, `scrubEvent`. Web and api both use it.
- **Api** (`apps/api/src/monitoring/`, all new): `sentry.ts` (the only `@sentry/node` import; errors
  only, no tracing, `maxBreadcrumbs: 0`, `sendDefaultPii: false`, release = `RENDER_GIT_COMMIT`, tag
  `service:api`), `options.ts` (pure: DSN/release/env decisions, fail-closed `apiBeforeSend`),
  `error-hook.ts` (dependency-free seam so services never import the SDK), `trpc-error.ts`,
  `fastify-errors.ts`, `worker-errors.ts`, `process-handlers.ts`, `smoke-test.ts`.
- `apps/api/src/index.ts`: `initSentry()` first; tRPC `onError` -> `reportTrpcError`; Fastify
  `onError` hook (covers `/chat` handler + preHandler, `/health`, `/metrics`); worker `failed`
  events on all three workers; unhandled-rejection handler; `POST /internal/sentry-test`.
- `apps/api/src/services/gateway.service.ts`: one line - a THROWN post-stream deduction is now also
  reported (no logic change; no-op without a sink).
- `apps/api/src/config.ts`: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` as lenient optional
  strings (a blank or mistyped DSN must not stop the api booting).
- `apps/api/package.json` + `pnpm-lock.yaml`: `@sentry/node ^10.0.0`. **Lockfile edited by hand**
  (same 10.75.3 snapshot web already resolves).
- `.env.example`, `docs/runbooks/high-error-rate.md` (Sentry triage note), `docs/LAUNCH_CHECKLIST.md`.

### Frozen-zone edits (owner-approved 2026-09-29)
- `apps/web/lib/monitoring/config.ts`: now re-exports the shared module; keeps
  `isMonitoringEnabled`, `procedureFromKey`, `beforeSend`, `monitoringEnvironment`. All 15 existing
  tests in `config.test.ts` still pass against it (executed).
- `apps/web/app/api/trpc/[trpc]/route.ts`: `onError` also calls the existing web `reportError` for
  `INTERNAL_SERVER_ERROR` only (original `cause`, procedure name as the only tag, never the input).
  Before this, tRPC server faults on Vercel never reached Sentry (tRPC turns them into JSON 500s,
  so Next's `onRequestError` does not see them).

### External contract
- New api route `POST /internal/sentry-test` (Bearer `INTERNAL_SERVICE_TOKEN`): 401 bad/missing
  token, 409 `SENTRY_DISABLED` if no valid DSN, otherwise a deliberate 500. Not part of
  `API_CONTRACT.md` (internal drill only). No other request/response shape changed.

### Behaviour to know
- **Unhandled promise rejections no longer crash the api**: logged, reported, process keeps running
  (was: Node 20 default = exit). `uncaughtException` is unchanged (still exits).
- Web events are now scrubbed slightly harder than before: `extra`, `request.env` and stack-frame
  `vars` dropped; `contexts`/`tags` deep-redacted by key; `sk-*` keys and bcrypt hashes redacted;
  exception messages capped at 500 chars.
- Worker failures are reported per attempt (3 attempts => up to 3 events, grouped into one issue).
- Expected tRPC codes (401/403/400/404/409/429...) are never reported, by design.
- Sentry adds no Redis commands (N11 unaffected).

## Session 14 - P2.1 build fix (frozen-zone edit, owner-approved 2026-09-30)
- `apps/web/next.config.ts`: `transpilePackages: ["@ai-platform/config"]` so webpack compiles the
  raw-TS `@ai-platform/config/monitoring-scrub` subpath pulled in by `instrumentation-client.ts`.
- Fixes `Web Build (next build)` and `E2E (Playwright)`. No behaviour change at runtime.

## Session 15 - P2.3 Queue hardening + Redis policy (closes G6, N1)
- Every BullMQ queue now trims finished jobs: `removeOnComplete {age 86400, count 1000}`, `removeOnFail {age 604800}`.
  Applies to jobs added after deploy. `queue-retention.test.ts` fails if a queue is added without it.
- New `aip_job_failures_total{queue}`; failed-job burst (>=5 in 5 min per queue) -> one Telegram warning per 15 min.
  The `alerts` queue is counted but never alerts about itself.
- New `redisHealth` scheduled job (every 10 min + at startup): critical alert if `maxmemory-policy` != `noeviction`,
  warning at >=70% memory. Provider blocking CONFIG/INFO degrades to a one-time log line, never an error.
- Behaviour change: none on request paths; all additions are fire-and-forget (L12).
- Owner steps + drills: `docs/runbooks/REDIS_POLICY.md`.

## Session 16 - P2.2 Alert delivery (closes G4)
- One Telegram sender (`monitoring/telegram.ts`): plain text, redacted, 4 s timeout, never throws. The alert worker now throws on a failed send so BullMQ retries.
- `queueAlert()` falls back to a direct send when Redis is down or slow (>3 s). Rare duplicate alert possible; a lost one is not.
- New alerts: provider failing (>50% of >=5 calls in 2 min), >5 failed deductions/min, fraud auto-suspend. All fire-and-forget, cooldown 15 min (fraud: 1 h per user+type).
- New routes: `GET /health/gateway` (public, cached 30 s, up/down only) and `POST /internal/sentry-alert?token=` (404 unless `SENTRY_WEBHOOK_TOKEN` set; forwards title/rule/project/link only).
- Deleted `infra/alerts.yml`; mapping in `docs/runbooks/ALERTING.md`.
- Behaviour change: none on request paths (L12). `fraud.service` now imports the shared sender instead of calling fetch itself.

## P3.1 — Redis-backed rate limiter (closes G9)
- New `apps/api/src/utils/redis-rate-limiter.ts`: `checkRateLimit(key, max, windowMs)` -> `{allowed, count, limit, retryAfterSeconds, degraded}`. Atomic Lua (INCR; PEXPIRE only on the first hit or if the key has no TTL). Own lazy Redis client (1.5 s command timeout), no work at import.
- Moved to it: `/chat` middleware (one Redis check per request, key `chat:user:{id}` or `chat:ip:{ip}`), `billing.submitManualPayment` (3 limits), `user.generateApiKey` / `claimWelcomeBonus`. The 429 `Retry-After` is now the real time left; the body keeps `error`/`message` and adds `retryAfterSeconds`.
- Bug fixed: `fraud.checkRequestVelocity` re-armed its 60 s expiry on every request, so a user chatting every ~30 s got a 429 after ~10 min. That counter is removed; the method is now `trackRequestIdentity` (multi-IP / shared-IP signals only, never blocks). `HIGH_REQUEST_VELOCITY` is still logged, once per window, via `recordRequestRateExceeded`. The old in-memory pass that double-counted `/chat` is gone.
- Redis outage: per-process fallback (not fully open, a deliberate deviation from the plan); Redis skipped for 5 s after a failure so a dead Redis adds no latency; metric `aip_rate_limit_fallback_total`; one alert per 5 min. Money paths (billing lock, affordability) still fail closed.
- NOT changed (frozen zone): `apps/web/app/api/redeem`, `user/delete-account`, `user/export-data` still call the synchronous per-process `checkLimit`. Recommended follow-up (needs approval, one `await` each): switch them to `checkRateLimit`. `redeem` is also covered by the Redis fraud check; the other two are per-process only until then.
- Known limit: fixed window, so a burst can reach 2x `max` across a window boundary.

## P3.5 - Security sweep (closes N6, N9)
- New `apps/api/src/security/`: `plugins.ts` (CSP `default-src 'none'`, exact-origin CORS, 1 MiB body limit, 4 MiB on `/chat`, logger redaction, `/metrics` guard), `limits.ts` (shared Zod bounds), `admin-2fa.ts`, `log-scan.ts`. `index.ts` now calls them; its behaviour on valid requests is unchanged.
- Behaviour changes: `GET /metrics` returns 404 in production until `METRICS_TOKEN` is set, then requires a Bearer token. `listUsers`/`listFraudEvents` `limit` is 1..100 (was unbounded), offsets are capped at 100,000, amounts/credits/prices/strings have maximums (`security/limits.ts`). Admin 2FA gate is OFF unless `ADMIN_REQUIRE_2FA=true` on both Render and Vercel.
- Body limit deviation from the pre-build summary: 4 MiB on `/chat`, not 2 MiB (Vercel's cap is 4.5 MB; 2 MiB would reject long Arabic histories).
- Also changed: `db-ops.yml`, `db-migrate.yml` (reset refuses when users exist), `packages/db/src/seed.ts` (refuses on a database with real users), `.env.example`, `apps/api/package.json` (export `./security/admin-2fa`).
- Frozen-zone exceptions (owner-approved 2026-09-30, "fix them and delete them if not wired"): (1) deleted the 8 `apps/web/app/api/admin/**` REST routes (repo-wide grep: zero callers; they bypassed the 2FA gate; every one has a tRPC equivalent). (2) `apps/web/lib/auth.ts`: `rateLimit.storage: "database"` + `rateLimit` in the adapter schema map (2 small edits). Supporting: `packages/db/src/schema/rate-limit.ts`, migration `0019_auth_rate_limit.sql` (RLS on, `key` indexed not unique), registered in `deploy.yml` and `db-ops.yml` lists; nightly `pruneAuthRateLimit` job (`services/auth-rate-limit.service.ts`). Comments that referred to the deleted routes updated.
- **Deploy order:** run 0019 on production BEFORE the web deploy, or `/api/auth/*` errors.


## P3.6 - Provider-cost guard (closes N7)
- New pure module `apps/api/src/services/price-guard.ts`: `evaluateModelPrices()` flags `below_cost` (critical), `low_margin` (< 40%), `zero_wholesale` and `upstream_drift` (> 5%); `formatDigest()`; OpenRouter public model-list parser/fetcher. Real cost = the OpenRouter price when the model id matches, else our own wholesale. Models with no match are counted as "no upstream match", never silently passed.
- New daily `priceGuard` job (04:00 UTC, `reports` queue): one Telegram digest via `queueAlert`, silent when clean; an unreachable feed is reported in the digest. Runs only over `published` AND `isAvailable` models.
- `models.publish` now (1) runs inside a transaction that also writes `provider_prices`, and (2) after commit fires a local-only, fire-and-forget Telegram alert if the saved price is below cost / under the margin bar / unpriced. An alert failure never fails or rolls back the save (L12).
- **Bug fixed:** nothing ever wrote `provider_prices`, so `dashboard.service.ts` priced all usage at $0 (admin cost 0, margin ~100%). Now written on publish (`provider-price.service.ts`, USD per 1K tokens, append-only history) and seeded by migration `0020_provider_prices_backfill.sql`. Past-period dashboard cost is an estimate (valued at today's wholesale) until prices change after deploy.
- `infra/scripts/price-audit.ts` now reads the live `models` table and reuses the same checks (`--offline` skips the feed). Run: `pnpm --filter @ai-platform/db exec tsx ../../infra/scripts/price-audit.ts`.
- **External contract:** no change. `models.publish` input and response are identical. `admin.getDashboardStats` / `getRevenueTimeseries` keep their shape; only the `cost` values become real.
- **Deploy order:** migration 0020 can run before or after the deploy (idempotent). No new env vars. Registered in `deploy.yml` (e2e) and `db-ops.yml` lists.
- Frozen zone: untouched (no file under `apps/web` edited). No DELETE list.
- Runbook: `docs/runbooks/PRICE_GUARD.md`; alert table row added to `docs/runbooks/ALERTING.md`.

## Session 34 - P5.1 Supabase Storage foundation
- New: `storage_objects` table (migration `0021_storage_objects.sql`, re-runnable, RLS on), `apps/api/src/services/storage.{policy,client,service}.ts`, `storageSweep` job (every 15 min, only registered when storage is configured), `docs/runbooks/STORAGE.md`.
- **External contract:** no change. No new route or tRPC procedure (P5.2 adds them).
- **Deploy order:** apply 0021 first; then set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on the **Render api only**. Both unset = behaviour identical to before.
- **Env:** two new optional vars; never on Vercel (`config.ts` is imported in-process by web).
- Frozen zone: untouched. The deletion cascade is done by the sweep, not by editing `delete-account` / `conversations/[id]` routes.

## Session 42 - P5.3 Voice input (server-side transcription)
- New: tRPC `voice.createUploadUrl` / `confirm` / `transcribe`, `services/transcription.{policy,core,service}.ts`, `routers/voice.router.ts`, `docs/runbooks/VOICE.md`.
- **External contract:** additive. New `voice.*` procedures (documented in `docs/frontend/API_CONTRACT.md`). Changed behaviour of existing calls: `models.list` no longer returns a model whose categories contain `transcription`; `/chat` answers `404 MODEL_NOT_FOUND` for such a model; `models.publish` keeps an existing `transcription` marker. Nothing changes for models without the marker.
- **Deploy order:** no migration, no env var, no dependency. Gateway channel + publish + one SQL update (VOICE.md section 1) turn it on; without them every `voice.transcribe` answers `TRANSCRIPTION_NOT_CONFIGURED` and nothing else changes.
- Storage behaviour change: voice notes (audio bucket) may have no conversation; the sweep no longer claims conversation-less **audio** immediately; audio has its own 100/day upload cap.
- Privacy policy (both copies, byte-identical): one sentence on voice recordings. "Last Updated" unchanged, as in earlier sessions.
- Frozen zone: untouched (no file under `apps/web` edited except `apps/web/content/legal/privacy.md`, the generated copy touched in earlier sessions). No DELETE list.


## Session 43 - P5.3 CI fix (Type-check, Web Build, E2E)
- Type-only fix, no behaviour change: `TranscribeInput.durationMs` / `language`, `DurationInputs.declaredMs` and `callProvider`'s `language` now accept `undefined` explicitly (`exactOptionalPropertyTypes` is on); `transcription.service.ts` no longer names the DOM-only `BlobPart` (copies the bytes into a fresh `Uint8Array` for the `Blob`); `transcription.core.test.ts` reads mock state through one `spy()` accessor.
- External contract: unchanged. No migration, dependency, lockfile or env change. Frozen zone: untouched. No DELETE list.

## Session 44 - P6.1 Structured stream (protocol v2) + backend emission
- New: `packages/types/src/stream.types.ts` (types only), `apps/api/src/services/stream-v2.ts` (+ `stream-v2.test.ts`). Changed: `gateway.service.ts` (+ tests), `apps/api/src/index.ts`, `packages/types/src/index.ts`, **frozen** `apps/web/app/api/chat/route.ts` (+ test).
- **External contract:** additive and opt-in. `POST /chat` answers the structured SSE stream only when `Accept` lists `application/vnd.aip.stream+v2`; every other request (the whole current UI) gets the same plain-text stream as before. Documented in `docs/frontend/API_CONTRACT.md` section 3.
- **Frozen-zone exception (owner-delegated 2026-10-01, revert-able by deleting one spread line + helper):** the web proxy forwards `Accept` upstream only for the exact v2 media type. Without it a browser could never reach v2 through Vercel. Other Accept values are not forwarded.
- **Internal change to know about:** `streamChat` now ends the HTTP response after the pure token-fallback/cost math (was: before it) so the v2 tail can carry usage. v1 bytes are unchanged; billing and message saving still run after `end()`, once.
- **Deploy order:** api and web in either order (web forwarding is a no-op until a client sends the header; api ignores the header unless exact). No migration, dependency, lockfile or env change.
- **How to verify after deploy** (P6.1 stays unticked until both pass):
  1. CI: Type-check & Lint, API Tests, Web Unit Tests, Web Build, E2E all green.
  2. Logged in on the web app, browser console:
     `const r = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/vnd.aip.stream+v2'},body:JSON.stringify({model:'<a chat model id>',messages:[{role:'user',content:'say hi'}]})}); console.log(r.headers.get('content-type')); console.log(await r.text());`
     Expect `text/event-stream; charset=utf-8` and frames `message_start`, `content_block_start`, `content_block_delta`..., `content_block_stop`, `message_delta` (usage + creditCost), `message_stop`.
  3. Same call without the `Accept` header: expect `text/plain; charset=utf-8` and plain text, as before. Send one normal message in the real chat UI: it must look and bill exactly as before.
  4. `/billing` history: the v2 call produced exactly one "Chat usage" transaction, and its amount equals `creditCost` in `message_delta` (micro-credits).
- Frozen zone: one owner-delegated exception above; nothing else touched. No DELETE list.

---

## Session 45 - P6.2 Provider normalization (reasoning, tool calls, status)
- New: `apps/api/src/services/stream-normalize.ts` (+ `stream-normalize.test.ts`). Changed: `stream-v2.ts` (+ tests), `packages/types/src/stream.types.ts`, `gateway.service.ts` (+ new P6.2 block in `gateway.service.test.ts`), `docs/frontend/API_CONTRACT.md` section 3, `docs/MASTER_PLAN.md`.
- **External contract:** additive, v2 stream only. New event `status {code:"waiting"}` (once, before the first block, after ~2 s of upstream silence), new block types actually emitted (`thinking`, `tool_use`), new `stopReason: "tool_use"`. v1 (the whole current UI) is byte-identical. No migration, dependency, lockfile or env change. Frozen zone: untouched.
- **Internal changes to know about:** (1) in v2 the usage fallback estimate and the "partial answer, bill it" check also count reasoning text and tool-call arguments (before, a reasoning-only partial billed nothing); saved `content` is still text only. v1 billing is unchanged. (2) A timer runs during every v2 stream (cleared on first output and in the read loop's `finally`).
- **Known limits:** the request never sends `tools` or asks for reasoning, so `tool_use` does not occur today and `thinking` appears only if the gateway returns it by default; status cannot fire before the provider's headers arrive; out-of-order tool fragments are dropped (counted, never misplaced).
- **Deploy order:** api only matters (web forwards nothing new). No migration.
- **How to verify after deploy** (P6.2 stays unticked until 1-3 pass):
  1. CI: Type-check & Lint, API Tests (look for `stream-normalize`, `stream-v2`, `gateway.service` P6.2 block), Web Build, E2E green.
  2. Console fetch with `Accept: application/vnd.aip.stream+v2` (same snippet as Session 44) against a **reasoning model** if you have one published: expect a `thinking` block before the `text` block, and `message_delta.usage.outputTokens` > 0. Against a normal model: same output as in Session 44.
  3. Same call without the header and one message in the real chat UI: plain text, looks and bills exactly as before; one "Chat usage" transaction.
  4. Optional: send to a slow model and watch for one `status` frame at about 2 s. If it arrives only at the end, the Vercel proxy is buffering SSE (report it; do not fix it in web).

---

## Session 46 - P6.5 Tool-call groundwork (gateway spike + capability helper)
- New: `scripts/gateway-tool-spike.mjs` (+ `gateway-tool-spike.test.mjs`), `apps/api/src/services/model-capabilities.ts` (+ `model-capabilities.test.ts`), `docs/runbooks/TOOL_SPIKE.md`. Changed: `docs/MASTER_PLAN.md` only (P6.5 section + tracker).
- **External contract:** none. `/chat`, the stream and every API are unchanged; nothing calls the new helper yet, and the request still never sends `tools`. No migration, dependency, lockfile or env change. Frozen zone: untouched.
- **Design note:** capability flags reuse the existing `models.categories` values `functionCalling` and `reasoning` (admin toggles already exist; model sync does not touch them). No new column.
- **Deploy order:** nothing to deploy for behaviour; the api change is an unused module.
- **How to verify** (P6.5 stays unticked until 2 is done):
  1. CI: Type-check & Lint and API Tests green (new: `model-capabilities.test.ts`, 6 tests).
  2. Follow `docs/runbooks/TOOL_SPIKE.md` section 1: run the script for 3-6 published model ids and send me the report. Costs a few cents (calls the gateway with the master key, bypasses billing).
  3. Optional: `node --test scripts/gateway-tool-spike.test.mjs` (11 tests; not in CI).

---

## Session 48 - P6.3a Web renderer for the structured stream (thinking block + status line, off by default)
- New (all `apps/web/features/chat/`): `lib/stream-v2-parser.ts`, `lib/stream-mode.ts`, `lib/wire-messages.ts` (+ a test each), `components/message/thinking-block.tsx`. Changed: `lib/stream-reader.ts`, `lib/chat-stream-reducer.ts` (+ tests), `types.ts`, `hooks/use-chat-stream.ts`, `components/message/{message,message-list,typing-indicator}.tsx`, `components/chat-view.tsx`, `styles/index.css` (3 keyframes), `messages/en.json`, `messages/ar.json`, docs.
- **External contract:** none. No api, proxy, migration, dependency, lockfile or env change. Frozen zone: untouched (the P6.1 `Accept` forwarding already exists). No DELETE list.
- **Default behaviour:** unchanged for everyone. v2 is requested only when `localStorage aip.flag.streamV2 === "1"` in that browser.
- **Behaviour changes to know about:** (1) with the flag on, reasoning shows in a collapsible block and is never saved or re-sent; (2) any assistant turn with an empty answer is now left out of the history sent with the next message (also affects flag-off, where it previously sent an empty assistant message); (3) with the flag on, a reasoning-only reply is kept as a partial/finished message instead of being dropped.
- **Known limits:** thinking is not persisted (P6.4), so it disappears on reload or conversation switch; `tool_use` blocks are ignored; token/credit fields are not filled from the stream; the status line cannot appear if Vercel buffers SSE.
- **Deploy order:** web only; nothing else to deploy.
- **How to verify** (P6.3 stays unticked until 1-4 pass):
  1. CI: Type-check & Lint, Web Unit Tests (new: `stream-v2-parser`, `stream-mode`, `wire-messages`; extended: `stream-reader`, `chat-stream-reducer`), Web Build, E2E all green. Vercel preview: open it.
  2. Flag OFF (default): send a message in the real chat. It must look, stream and bill exactly as before; no Thinking block; Network tab shows no `Accept: application/vnd.aip.stream+v2`.
  3. Turn ON: console `localStorage.setItem("aip.flag.streamV2","1")`, reload, pick a reasoning-capable model and send. Expect: Thinking block open with moving light and a seconds counter, collapsing to "Thought for Ns" when the answer starts, answer without leading blank lines. Tap the header: it toggles and stays as you left it. One "Chat usage" transaction.
  4. With the flag ON send a second message in the same chat: the request body's `messages` contain only `role` and `content` (Network tab). Edit an earlier message: the old reasoning disappears with the old reply.
  5. Visual checks on a phone width, Arabic (RTL) and dark theme: aperture glyph, hairline, label, and the Arabic wording. Enable "reduce motion" in the OS: block is still, nothing animates.
  6. Optional, slow model: one "Waiting for the model to start…" line at about 2 s. If it only appears at the end, Vercel is buffering SSE (report it).
  7. Turn off: `localStorage.removeItem("aip.flag.streamV2")`.

---

## Session 49 - P6.3b Voice input: server bridge + mic (off by default)
- New: `apps/api/src/services/voice-http.ts` (+ test); `apps/web/app/api/voice/[action]/route.ts` (+ test); `apps/web/features/chat/{lib/voice-recorder.ts,lib/voice-client.ts,lib/voice-flag.ts (+ tests),hooks/use-voice-input.ts,components/composer/mic-recording.tsx}`. Changed: `apps/api/src/index.ts` (registers the routes), `apps/api/src/services/transcription.service.ts` (+`isTranscriptionAvailable`), `composer-bar.tsx`, `chat-view.tsx`, `styles/index.css`, `messages/en.json`, `messages/ar.json`, docs (`API_CONTRACT.md`, `MASTER_PLAN.md`, this file, `SESSION_LOG.md`).
- **External contract (additive):** api gains `GET /voice/status` and `POST /voice/{upload-url,confirm,transcribe}`; web gains `/api/voice/[action]`. Frozen zone: owner-approved exception, NEW files only (`app/api/voice/**`); no existing frozen file edited. No migration, dependency, lockfile or env var. No DELETE list.
- **Default behaviour:** unchanged. The mic stays the old "coming soon" placeholder unless `localStorage aip.flag.voice === "1"`.
- **Deploy order:** api first (Render), then web (Vercel). Web before api would only make `/api/voice/status` fail, which hides the mic (safe).
- **Money:** `transcribe` is billed (existing P5.3 rules). A transcription that finishes is billed even if the transcript is empty (the UI says "no speech detected"). Nothing is retried automatically.
- **How to verify** (P6.3 stays unticked):
  1. CI all green; Vercel preview opens.
  2. Flag OFF (default): the mic is the same placeholder as before; Network tab shows no `/api/voice/*` call.
  3. Api: `curl -H "Authorization: Bearer $INTERNAL_SERVICE_TOKEN" -H "X-User-ID: <id>" $API/voice/status` returns `{"available":true|false}`; the same without the headers returns 401.
  4. Flag ON (`localStorage.setItem("aip.flag.voice","1")`, reload) on a phone and a desktop: the mic appears only if status is `true`. Tap it, allow the microphone, speak 5 s, tap the red square: "Transcribing..." then the text lands in the composer, editable and NOT sent. One "voice transcription" transaction; balance drops.
  5. Failure checks: deny the mic permission (message, no crash); tap and stop within half a second ("too short", no upload, no charge); airplane mode after recording (network message); drain the balance ("not enough credits"); the cancel X during recording and during transcribing.
  6. Visual: phone width, Arabic RTL, dark theme, reduce-motion on (dot and bars hold still). Compare with Elements2.html no. 12 and send screenshots.
  7. Safari/iOS specifically: it records `audio/mp4`; confirm the upload and transcription accept it.
  8. Browser console must show no CORS error on the storage PUT. If it does, the storage bucket needs the web origin allowed.
  9. Turn off: `localStorage.removeItem("aip.flag.voice")`.

---

## Session 50 - P6.3c Attachments: more file types, first-chat attach, sheet UI (off by default)
- **Api (new):** `extraction/office-text.ts`, `services/attachments-http.ts` (+ tests `office-text.test.ts`, `office-extract.test.ts`, `attachments-http.test.ts`). **Api (changed):** `extraction/{extract,file-type}.ts`, `services/{storage.policy,attachments.policy,gateway.service}.ts`, `test/fixtures.ts` (the "other zip" fixture was xlsx-shaped and is now a jar-shaped archive, because xlsx is supported), `index.ts`.
- **Web (new):** `app/api/attachments/[action]/route.ts` (+ test), `features/chat/{lib/{attach-types,attachments-client,attachments-state,attach-flag}.ts (+ tests),hooks/use-attachments.ts,components/composer/{attachment-sheet,attachment-strip,file-glyph}.tsx}`. **Web (changed):** `lib/{stream-reader,pending-first-message,voice-client}.ts` (+ test), `types.ts`, `hooks/{use-chat-stream,use-conversations}.ts`, `components/{chat-view,composer/composer-bar,message/message}.tsx`, `messages/en.json`, `messages/ar.json`. Docs: `API_CONTRACT.md`, `MASTER_PLAN.md`, this file, `SESSION_LOG.md`.
- **External contract (additive):** api gains `GET /attachments/status` and `POST /attachments/{upload-url,confirm,get}`; web gains `/api/attachments/[action]`; six more allowed MIME types on the `attachments` bucket (xlsx, pptx, odt, ods, odp, rtf). Frozen zone: owner-approved exception, NEW files only (`app/api/attachments/**`). No migration, dependency, lockfile or env var. No DELETE list.
- **Default behaviour:** unchanged for everyone, with TWO exceptions that are not behind the flag: (1) the api accepts the new Office types and fills a missing title/model on an existing conversation row; (2) the sidebar no longer lists conversations with no title (see the SQL below).
- **Deploy order:** api first (Render; on boot it updates the bucket's allowed types), then web. Web before api only hides the attach button.
- **Check before merging (sidebar filter):** conversations created through `POST /api/conversations` before this change never got a title. Run in the database: `select count(*) from conversations c where c.title is null and c.deleted_at is null and exists (select 1 from messages m where m.conversation_id = c.id);` If it is not 0, those chats would vanish from the sidebar: tell me and I will limit the filter to empty ones.
- **How to verify** (P6.3 stays unticked):
  1. CI all green (api: Type-check & Lint, API Unit Tests incl. the new `office-extract` and `file-type` cases; web: Unit Tests, Build, E2E). The api test job is the first place `office-extract.test.ts` runs.
  2. Api boot log shows the `attachments` bucket updated; `curl -H "Authorization: Bearer $INTERNAL_SERVICE_TOKEN" -H "X-User-ID: <id>" $API/attachments/status` returns `{"available":true}`; without the headers 401.
  3. Flag OFF (default): the "+" button is the old placeholder; no `/api/attachments/*` call in the Network tab; the sidebar looks the same.
  4. Flag ON (`localStorage.setItem("aip.flag.attach","1")`, reload). On a phone and a desktop: open "+", the sheet shows Camera (phone only), Photos, Choose a file. Compare with Elements2.html no. 19 and send screenshots (phone, Arabic RTL, dark).
  5. **First chat:** in a NEW chat attach a `.py` and a `.xlsx`; chips go Uploading, Reading, ready with the size; type a question; Send. The URL becomes `/chat/<id>`, the answer uses the file contents, the chips show on your message, and the sidebar then lists the chat WITH a title. Leave another new chat after attaching and never send: it must not appear in the sidebar.
  6. **Types:** a real xlsx (sheet names and values read), pptx, docx, pdf, odt, rtf (also an Arabic one), csv, a `.ts` file, a `.md`, a PNG on a vision model. Try refusals: `.zip` (archives message), `.doc`, `.xlsm`, `.heic`, `.mp3`, `.exe` renamed to `.txt` (the server refuses it by its bytes: "contents don't match"), a scanned PDF ("no readable text"), a 6 MB image, a 25 MB file, a 6th file.
  7. Remove a chip while it uploads (it stops); Stop/retry/edit a message that had files (the files are re-sent); a follow-up message does NOT see the files (known: attach again).
  8. Console: no CORS error on the storage upload. Turn off: `localStorage.removeItem("aip.flag.attach")`.

---

## Session 51 - P6.3c CI fix
- **Changed:** `apps/api/src/extraction/office-text.ts` (type alias for `TextDecoder`, no runtime change); `apps/web/features/chat/hooks/use-chat-stream.ts` (`SendExtra` exported, `send` accepts the optional second argument in the public type).
- **External contract / behaviour:** none. Types only. Frozen zone untouched; no migration, dependency or env change.
- **How to verify:** (1) CI: api `Type-check & Lint` (now also runs Lint), `Web Build (next build)`, then the rest of Session 50's list. (2) The `valkey-glide` / `require-in-the-middle` lines in the web build are warnings, not failures. (3) If a new type error shows up, send the first block.
