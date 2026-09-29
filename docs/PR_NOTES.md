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
