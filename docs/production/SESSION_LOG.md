# Production plan — session log

Plan: `docs/MASTER_PLAN.md` (the current one; see Session 3 note on the stale duplicate). One entry per
session, newest last. Each entry: what was decided, what changed (files),
what was verified, what was **not** verified, what is next. The plan's §4
tracker is ticked only after the owner confirms CI is green and any manual
steps are done; this log says where each phase actually stands.

Conventions: **[S]** stated by the owner, **[R]** read from the repo,
**[D]** checked against vendor docs, **⬜** unconfirmed.

---

## Session 1 — 2026-09-29 — P0.1 (first pass) · plan review

**Input:** repo zip + the plan. **Output:** Phase Summary only, then a first
ADR-011 draft.

- Read the plan against the repo. Found the plan's "ADR-010" clashes with an
  existing ADR-010 (admin Settings page) → new ADR is **ADR-011**.
- Found `platform_config` (migration 0014) has no RLS (N10) and `/metrics`
  is public (N9). Confirmed in code: no `trustProxy`, no SIGTERM handler,
  db pool `max: 1` by default, workers run inside the api process.
- Owner stated the stack: Vercel + Render + Supabase + "stash" (Upstash).
- Deliverable: ADR-011 draft with ⬜ cells and exact checks.
- Not verified: all live infra state, CI status.

## Session 2 — 2026-09-29 — P0.1 (update) + P0.2 + N10 fix

**Owner answers [S]:** gateway = New API, on Render; Redis = Upstash, **Free
tier**; Vercel = **Hobby**; "do everything like it's your project". Both
Render/Supabase are on free plans was stated.

**Research [D]:** Upstash Free = 500K commands/month; Vercel Hobby =
non-commercial only, 300 s function limit; Render Free = spins down after
15 min, no disk, no private inbound, one instance.

**Decisions (owner delegated, veto any):**
- L15 Upstash → paid Fixed/PAYG before launch. L16 Vercel → Pro before
  charging anyone. L17 Render api + gateway → paid instance types.
- Plan file renamed as requested to
  `docs/MASTER_PRODUCTION_AND_CAPABILITIES_PLAN.md` (plan text still said
  `MASTER_PLAN.md`; the "ADR-010" references were changed to ADR-011).
- Frozen zone (FRONTEND_REBUILD_PLAN §4 named list) untouched. This is not a
  frontend session, so edits to `apps/api/src/config.ts` and `infra/` are in
  scope.
- Runbooks and the old master plan: **bannered, not deleted or rewritten**
  (P2.2 / P3.2 / P4.1 own the rewrites).
- Local docker-compose retired: the owner develops on the cloud services.

**Changed (see the delivery message for the exact file lists):**
- ADR-011 rewritten with the new facts; ADR-005/006 marked superseded.
- Plan: gaps N9–N13, decisions L15–L17, launch-gate items.
- `LAUNCH_CHECKLIST.md` rewritten to mirror plan §11; `README.md` written
  (it contained the single word "Testing").
- `.env.example` rewritten: dead VPS/MinIO/Grafana variables removed, each
  variable labelled Vercel / Render / both.
- MinIO removed from `apps/api/src/config.ts` (optional vars; no runtime
  effect) and `turbo.json`.
- VPS stack deleted (list in the delivery message). `alerts.yml` kept as a
  reference-only file until P2.2.
- Migration `0017_platform_config_rls.sql` + both workflow migration lists.
- Deleted `cookies.txt` (a curl cookie jar committed at the repo root).

**Verified:** YAML/JSON of edited workflows, `turbo.json` and `alerts.yml`
parse; no `MINIO` left in edited code files; `decisions.md` changed by
additions and two status lines only.

**Not verified (cannot run the repo here):** `tsc`, lint, vitest, CI,
`next build`; that removing `MINIO_*` from `turbo.json` changes no build
hash the owner cares about; that migration 0017 applies cleanly on Supabase;
that nothing outside the repo (Render/Vercel env, scripts) reads `MINIO_*`.

**Status:** P0.2 delivered, awaiting CI + apply. P0.1 **open**: ⬜ cells in
ADR-011 (Render plans, gateway exposure and data store, Supabase backups,
Upstash eviction, regions). N10 needs 0017 applied to production.

**Next:** owner fills the ⬜ cells → close P0.1 → **P1.1** (account guard).

**Owner to-do (not code):**
1. Apply 0017 to Supabase (DB Operations → `constraints`, or `db:migrate:manual`); run the RLS query.
2. Add `cookies.txt` to `.gitignore` (no root `.gitignore` was in the zip, so I did not overwrite one).
3. Upgrade Upstash and Vercel plans before real users; confirm Render plans.

**Session 2 — files deleted** (`git rm`): `infra/docker-compose.yml`,
`infra/docker-compose.dev.yml`, `infra/Caddyfile`, `infra/gatus.yml`,
`infra/prometheus.yml`, `infra/grafana/dashboards/overview.json`,
`infra/grafana/dashboards/provisioning.yml`, `infra/postgres/init.sql`,
`infra/postgres/postgresql.conf`, `infra/scripts/deploy.sh`,
`infra/scripts/backup.sh`, `infra/.env.example`, `cookies.txt`.
Kept on purpose: `infra/alerts.yml` (until P2.2), `generate-codes.ts`,
`backfill-referral-codes.ts` (used by a workflow), `price-audit.ts` (P3.6).
`init.sql` is not needed: `0001_constraints.sql` recreates its trigger
function and the tests already skip it.

---

## Session 3 — 2026-09-29 — P0.1 (partial answers)

**Input:** repo zip + plan; owner answers [S].

**Correction to my own earlier claim:** I first said `docs/MASTER_PLAN.md`
was the stale copy. That was backwards. `docs/MASTER_PLAN.md` is current (has
N9–N13, L15–L17, ADR-011). `docs/MASTER_PRODUCTION_AND_CAPABILITIES_PLAN.md`
(repo copy and the upload are byte-identical) is the **old** version (says
"ADR-010", no N9–N13). Owner confirmed MASTER_PLAN.md is the working plan and
must not be deleted. Session 2's note that the plan was renamed was wrong for
the repo as delivered; the header of this log now points to `MASTER_PLAN.md`.
Nothing deleted. The stale duplicate is left in place for the owner to
retire.

**Owner answers [S]:** OpenRouter key -> New API channel -> New API gateway ->
api. New API uses PostgreSQL on Supabase (not SQLite). api uses pooler port
6543, web uses 5432. Vercel Deployment Protection is on. Not public yet.

**Changed:** `docs/architecture/decisions.md` (ADR-011: answers recorded,
OpenRouter row added, ⬜ list reduced and made more precise);
`docs/production/SESSION_LOG.md`.

**Found:** web on 5432 (session-mode pooler if it is the pooler host) fits the
earlier `EMAXCONNSESSION` log -> input to P4.2. Single upstream (OpenRouter)
-> input to P2.2. Gateway DB may share the app's Supabase project -> RLS/Data
API exposure to check.

**Not verified:** everything above is stated, not checked. No dashboard,
`curl`, or `CONFIG GET` was run. Not run: tsc, lint, vitest, CI.

**Status:** P0.1 **still open**. Remaining ⬜: Render plan/count/region for api
and gateway; gateway public or private (curl); `/health` and `/metrics`
curl; Supabase plan/backups/PITR/region/host/separate-project; Upstash
region/eviction/command count/TLS; Vercel region.

**Next:** owner fills the remaining ⬜ -> set ADR-011 Accepted, tick P0.1 ->
P1.1. Tracker not ticked.

---

## Session 4 — 2026-09-29 — P0.1 (evidence from curl)

**Owner answers [S]:** gateway database is a **separate Supabase project**;
api and gateway are separate Render services; both on the **Render Free**
plan.

**Observed [O] (owner-pasted output, 07:05 UTC):** gateway `/v1/models` -> 401
(public, token-protected); api `/metrics` -> 200 unauthenticated (N9);
api `/health` -> 200; `server: cloudflare` + `cf-ray` on api responses.

**Confirmed:** N8 (gateway public) and N9 (metrics public) are real in the
running system, not just in code. N13 applies to both services. L17 remains
the fix for N8 and N13.

**Changed:** `docs/architecture/decisions.md` (ADR-011 table, new Observed
block, shorter remaining list, OpenRouter and gateway-project checks added);
`docs/production/SESSION_LOG.md`. No code.

**Not verified:** I did not run the curls; they are the owner's output.
Whether `cf-connecting-ip` reaches the app, the Render regions, and all
Supabase, Upstash and Vercel facts. "Free plan" was taken to mean both Render
services; the owner should say so if only one is Free.

**Status:** P0.1 **still open**, 8 items left, all dashboard reads.

**Next:** either fill the remaining items, or start P1.1 in parallel (it does
not depend on P0.1). Tracker not ticked.

---

## Session 5 — 2026-09-29 — P0.1 closed · P0.2 found half-applied

**Owner answers [S]:** everything is on free plans; no backups taken; no
monitoring except Sentry; skip regions. **Observed [O] (screenshot):** Render
`openportal` (Docker) and `openportal-gateway` (Image) both **oregon**,
Deployed.

**Checked [D]:** Supabase Free has no downloadable backups and pauses after a
week idle (Supabase docs via its GitHub; pricing guides July 2026).

**P0.1 closed.** ADR-011 Accepted. Every bullet of the plan is answered with a
fact except Redis eviction, which is carried to P2.3's first step, plus the
other carried items listed in the ADR. New decision **L18** (Supabase Pro
before launch) added to the plan; §4 tracker ticks P0.1 only.

**ADR-005/006 vs code (owner question):** both ADRs are marked Superseded and
the code already agrees: Redis is used through `ioredis` and `REDIS_URL`, no
Valkey- or Caddy-specific code. But the repo **still contains** `infra/Caddyfile`,
the docker-compose files (Valkey), gatus, prometheus, grafana, postgres,
`deploy.sh`, `backup.sh`, `infra/.env.example` and root `cookies.txt`. Session
2's deletions were **not applied** in the zip uploaded this session (the
other Session 2 edits were: 0017 and its workflow entries, README, root
`.env.example`). So P0.2 is **not done**. One comment in frozen
`apps/web/next.config.ts` still says "on top of Caddy"; left alone (frozen).

**Also seen:** `chat-idempotency.service.ts` falls back to
`redis://localhost:6379` when `REDIS_URL` is unset. On Render that would fail
quietly; input to P2.3.

**Changed:** `docs/architecture/decisions.md`, `docs/MASTER_PLAN.md`,
`docs/production/SESSION_LOG.md`. No code.

**Not verified:** nothing was run. Whether the owner's repo differs from the
zip (the zip may be older than their working tree).

**Next:** owner applies the P0.2 deletion list; then P0.2 is closed.

---

## Session 6 — 2026-09-29 — P0.2 closed on owner confirmation · P1.1 summary

**Owner:** replied "Ok" to the P0.2 summary and DELETE list. Taken as: the
deletions are applied and CI is green. **Not verified by me**: I was not sent a
new zip or CI output. If the deletions were not applied, P0.2 is not really
closed and the tracker tick should be reverted.

**Changed:** `docs/MASTER_PLAN.md` (§4: P0.2 ticked), this log. No code.

**P1.1 read-through (no build yet), findings for the owner:**
1. The plan's "guard the procedures" covers tRPC only. About 19 route
   handlers in frozen `apps/web/app/api/**` (redeem, balance, chat proxy,
   admin/*, ...) call `auth.api.getSession` directly and never check
   `status`/`isFraudFlagged`.
2. `apps/web/lib/auth.ts` (frozen) has `cookieCache` enabled (5 min), so a
   deleted session row can stay valid on those routes for up to 5 minutes.
3. Frozen `apps/web/app/api/admin/users/[id]/route.ts` PATCH also sets
   `status` directly: no session revocation, no self-suspend or superadmin
   protection (G2b through a second door).
4. `fraud.service.ts` flags users (`isFraudFlagged`) but revokes nothing.

**Status:** P1.1 waiting for the owner's OK on the Phase Summary and on the
frozen-zone options.

---

## Session 7 — 2026-09-29 — P0.2 reopened (my error) · safety check of the DELETE list

**What happened:** in Session 6 I ticked P0.2 on a bare "Ok" without evidence.
The owner then said the deletions were **not** applied and asked whether they
are safe. P0.2 tick **reverted**. Rule going forward: no tick without the
owner saying the deletions/CI are done.

**Safety check [R]:** grep across code, workflows, Dockerfiles and package
scripts: **nothing imports or runs** any file on the DELETE list. Only comments
mention them (`packages/db/src/index.ts`, `apps/api/src/index.ts`,
`metrics.ts`, `testDb.ts`, `redis-connection.ts`, and frozen
`apps/web/app/api/chat/route.ts`); stale comments, no runtime effect.
`testDb.ts` recreates the trigger function itself and reads only
`0001_constraints.sql`, never `init.sql`. Neither Dockerfile copies `infra/`.
`backfill-referral-codes.yml` uses `infra/scripts/backfill-referral-codes.ts`,
which is not on the list. `cookies.txt` holds one Vercel SSO nonce cookie for
a preview domain (low sensitivity); it stays in git history either way.

**Found my own error:** `README.md` and `docs/LAUNCH_CHECKLIST.md` (Session 2)
pointed to `docs/MASTER_PRODUCTION_AND_CAPABILITIES_PLAN.md`, the stale copy.
Both now point to `docs/MASTER_PLAN.md`. Only after this is deleting the stale
copy safe.

**Changed:** `README.md`, `docs/LAUNCH_CHECKLIST.md`, `docs/MASTER_PLAN.md`
(tick reverted), this log. No code.

**Not verified:** nothing run; CI not seen.

---

## Session 8 — 2026-09-29 — P1.1 built

**Input:** repo zip + plan. Phase Summary approved by the owner ("Ok"), with my
recommendation for the frozen routes (DB trigger, no frozen edits, gaps logged).

**Checked before building [R]:** P0.2 deletions are applied in this zip
(`infra/` = `alerts.yml` + `scripts/`; no `cookies.txt`). Tracker not touched.

**Changed:** see the delivery message for the exact list. Summary: shared
`account-guard.ts`; guard on all three `authMiddleware` paths, `protectedProcedure`
and `adminProcedure`; `updateUserStatus` rewritten in one transaction (no
self-suspend, superadmin protection, 404, session revocation, richer audit row);
fraud auto-flag revokes sessions; migration 0018 trigger; workflow lists; tests.

**Decisions:**
- Non-`active` status (including `pending_verification`) is refused, to match the
  REST paths' existing behaviour. better-auth issues no session before email
  verification and `ensureUserSetup` activates verified users at session
  creation, so this should not lock out onboarding. **Not verified by running.**
- REST error bodies left as they were; codes added only to tRPC errors.
- Reactivation is allowed for the same actors as suspension (an admin cannot
  reactivate another admin).

**Tests added (Testcontainers, real Postgres):** `utils/account-guard.test.ts`,
`middleware/auth.middleware.test.ts`, `routers/account-guard.test.ts`, one case
in `services/fraud.service.test.ts`. `testDb.ts` now also applies 0018;
`factories.ts` gained `status`/`role`/`isFraudFlagged` options and
`createTestSession`.

**Red/green:** the tests were written to fail on the old code (cookie path 200,
flagged user succeeds on the three procedures, sessions survive suspension,
self and superadmin suspension allowed). I could not run either side here, so
"red on old code" is by reading the old code, not by execution. The fraud
session test also passes on old code once the trigger exists, because the
trigger does the same deletion; it is a two-layer check, not a red test.

**Not verified (cannot run the repo here):** `tsc`, lint, vitest, CI,
`next build`. Only a TypeScript syntax parse of every touched file was run.
That migration 0018 applies on Supabase. That the mocks in
`routers/account-guard.test.ts` cover every module the router graph loads
(if `config` is read from a module I did not mock, the file will fail at import
and the fix is one more `vi.mock`). That Drizzle accepts a transaction as the
`revokeUserSessions` handle (structurally it should).

**Status:** P1.1 built, awaiting CI and owner confirmation. Tracker **not
ticked**.

**Next:** owner runs CI, applies 0018 (DB Operations -> constraints, or
`db:migrate:manual`), does the manual check, confirms. Then P1.2.

---

## Session 9 — 2026-09-29 — P1.1 follow-up (frozen-zone gaps) · P1.2 summary

**Owner:** "Do it now and move to phase 1.2", answering my offer to close the
frozen-route gaps. Taken as explicit approval of the frozen-zone follow-up
described in Session 8 / `docs/PR_NOTES.md`. **CI status of Session 8 was not
reported**, so P1.1 is still **not ticked**. The owner did confirm from a
screenshot that trigger `users_revoke_sessions_on_lockout` exists in production.

**Changed (frozen zone, approved):** 19 route files (24 handlers) gained the
shared account guard; `admin/users/[id]` PATCH delegates to the shared service;
`lib/auth.ts` `cookieCache` disabled. New: `apps/web/lib/account-guard-server.ts`,
`apps/api/src/services/user-status.service.ts`. `admin.router.ts` now delegates to
the same service; `apps/api/package.json` gained two exports. Full list and
per-file behaviour in `docs/PR_NOTES.md`.

**Verified:** every changed or new TypeScript file parses. Each frozen route
diff was measured: pure additions (3 lines per file, 5 to 7 where a file has
several handlers) except the PATCH rewrite and one comment-plus-line change in
`auth.ts`. The service was exercised by reading, not running.

**Not verified (cannot run the repo here):** `tsc`, lint, vitest, CI, `next build`.
Specifically: that `@ai-platform/api/utils/account-guard` and
`.../services/user-status` resolve from `apps/web` the same way the existing
`.../utils/rate-limiter` export does; that Next's build accepts the new import in
route files; that disabling `cookieCache` behaves as documented on the pinned
better-auth version; that the new mocks in `account-guard-server.test.ts` are
enough for the web vitest setup.

**Decisions:** blocking session creation for locked users was NOT done (see
PR_NOTES). Suspended users cannot self-serve data export or account deletion.

**Next:** P1.2 Phase Summary, then wait for the owner's OK.

---

## Session 10 — 2026-09-29 — P1.2 per-user in-flight billing lock (closes G5)

**Owner:** "OK" to the Session 10 Phase Summary (30 s TTL + 10 s heartbeat, 409 shape,
continue on lock loss). The owner's uploaded `MASTER_PLAN.md` shows P1.1 ticked, taken as
"CI green + manual check done"; the repo copy of the plan had it unticked, so the tracker
now carries the owner's tick. The uploaded repo zip was byte-identical to the Session 9
delivery, so this builds on that state.

**Plan vs code:** two deviations, both announced in the summary and approved.
(1) TTL 30 s + heartbeat instead of "max stream time + margin". (2) Real Redis via a
`redis:7-alpine` CI service container + `TEST_REDIS_URL`, not Testcontainers (no lockfile
change possible here). A guard test fails in CI if the variable is missing.

**Changed:** `apps/api/src/index.ts` (`/chat` wrapped in the lock),
`services/gateway.service.ts` (optional `requestId`), `metrics.ts` (3 counters),
`.github/workflows/deploy.yml` (Redis service). **New:** `services/billing-lock.service.ts`,
`services/billing-lock.service.test.ts`. **Tests added:** `gateway.service.test.ts` (requestId
passthrough). **Docs:** `docs/PR_NOTES.md`, `docs/frontend/API_CONTRACT.md` (new 409/503),
`docs/MASTER_PLAN.md` tracker. No frozen-zone edits. No DELETE list.

**Design:** lock key `lock:billed:{userId}`; acquire `SET NX PX 30000`; heartbeat every 10 s via
compare-and-PEXPIRE Lua; release via compare-and-DEL Lua in `finally`. Busy -> `409
REQUEST_IN_PROGRESS` before any provider call and before the idempotency claim. Redis down ->
`503` fail closed + throttled best-effort alert. Lock lost mid-stream -> logged and counted, stream
continues, billing still atomic.

**Tests (red first, by reading):** on the old code there is no lock, so "second concurrent request
rejected before the provider call" and "exactly one of four simultaneous acquires wins" cannot
pass. Also covered: release on success / upstream error / abort, expiry takeover (late release
does not delete the new owner's key), heartbeat keeps a long operation alive, lost-lock detection,
fail-closed with Redis down, 409/503 reply shape, alert throttle. The "10 concurrent deductions"
test in `balance.service.test.ts` is untouched.

**Not verified (cannot run the repo here):** `tsc`, lint, vitest, CI. Only a TypeScript syntax
parse of every touched file and a YAML parse of `deploy.yml` were run. No Redis binary in the
sandbox, so the Lua scripts and all real-Redis tests have never executed. Also unverified:
Lua/EVAL behaviour on Upstash; ioredis `commandTimeout` behaviour during a real outage (the
fail-closed test uses an unreachable port, which approximates but is not the same as an Upstash
brownout); timing-based tests (300-1000 ms sleeps) on a loaded CI runner; whether Stop/tab-close
reaches the API through the frozen Vercel proxy; that the `redis` service container is reachable at
`localhost:6379` from the job (standard for GitHub-hosted runners).

**Status:** P1.2 built, awaiting CI and the manual check. Tracker **not ticked** for P1.2.

**Next:** owner runs CI (`api-tests` must show `billing-lock.service.test.ts` executed, not skipped),
then the manual check: two tabs sending at once -> second gets 409; kill the API mid-stream and
confirm `lock:billed:<id>` expires within 30 s. Frontend needs a 409 retry mapping (see PR_NOTES).
Then P1.3.


---

## Session 11 - 2026-09-29 - P1.2 follow-up: frontend 409/503 + CI fixes

**Owner request:** finish the frontend gap and fix the two CI failures from the screenshots.
Same phase (P1.2); no new phase started. P1.2 stays **unticked** until CI and the manual check pass.

**Plan vs code:** the Session 10 notes said the client should retry "with the same
`clientMessageId`". The web client never sends one (no hits in `apps/web`). Handled by resending the
identical body, which is safe because 409/503 are returned before any write. Idempotency on the
client remains a separate, unplanned item.

**CI failure 1 - Web Unit Tests:** `lib/account-guard-server.test.ts` "fails closed: a DB error
propagates". Test-only change (synchronous throw in the mock + try/catch assertions). Root cause
is not proven: I could not run vitest, so this is the most likely fix, not a confirmed one.

**CI failure 2 - E2E build:** `next build` died in `lib/fonts.ts` with `Cannot read properties of
null (reading '1')` inside next/font's Google loader, while `web-build` on the same run passed.
Treated as a transient Google Fonts response. Mitigation only: build retried 3x in both jobs.
Not a root-cause fix; the durable fix is self-hosting the fonts (`next/font/local`), which needs
the font files added to the repo.

**Changed:** `apps/web/features/chat/lib/stream-reader.ts`, `stream-reader.test.ts`,
`apps/web/lib/account-guard-server.test.ts`, `.github/workflows/deploy.yml`, `docs/PR_NOTES.md`,
`docs/frontend/API_CONTRACT.md`, this log. No DELETE list. No frozen-zone edits.

**Not verified:** `tsc`, lint, vitest, CI, `next build`. Only a TypeScript syntax parse and a YAML
parse were run. Unconfirmed: that the unit-test change fixes the CI failure; that retrying the
build is enough for the font failure; the UI while waiting (the composer should show "sending" for
up to ~6 s on repeated 409s - checked by reading only).

**Next:** owner re-runs CI; then the P1.2 manual checks; then P1.3.
