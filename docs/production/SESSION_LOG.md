# Production plan — session log

Plan: `docs/MASTER_PRODUCTION_AND_CAPABILITIES_PLAN.md`. One entry per
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
