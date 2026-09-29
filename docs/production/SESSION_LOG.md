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
