# openportal

Arabic-first AI chat platform that resells access to multiple model providers
through one credit balance. Monorepo (pnpm + Turborepo).

## Where things run (ADR-011)

| Piece | Host |
|---|---|
| `apps/web` (Next.js 15, also hosts the tRPC router and Better Auth) | Vercel |
| `apps/api` (Fastify: `/chat` streaming proxy, tRPC, BullMQ workers) | Render |
| AI gateway (New API, a separate repo) | Render |
| Postgres | Supabase |
| Redis (rate limits, idempotency, BullMQ) | Upstash |

There is no VPS or Docker Compose deployment. `docs/AI_Aggregator_Master_Plan_v2.md`
describes the retired original design and is historical only.

## Layout

- `apps/web`, `apps/api` — the two deployables
- `packages/db` — Drizzle schema, migrations, seeds
- `packages/config`, `packages/types` — shared code
- `infra/scripts` — operational scripts (code generation, price audit, backfills)
- `docs/` — plans, ADRs, runbooks, legal texts

## Docs to read first

- `docs/MASTER_PRODUCTION_AND_CAPABILITIES_PLAN.md` — production-readiness and capability roadmap
- `docs/production/SESSION_LOG.md` — what was done in each session of that plan
- `docs/FRONTEND_REBUILD_PLAN.md` and `docs/frontend/BRANCH_AND_CI_NOTES.md` — frontend rebuild track
- `docs/architecture/decisions.md` — ADRs
- `docs/LAUNCH_CHECKLIST.md` — what must be true before real users

## Environment

Copy `.env.example`; it says which variables belong to Vercel, Render, or both.

## Database migrations

`pnpm --filter @ai-platform/db db:migrate` applies the drizzle-kit migration (0000).
`pnpm --filter @ai-platform/db db:migrate:manual` applies the hand-written
`0001+` SQL files and records them in `_manual_migrations`. Adding a migration
also means adding its name to the two lists in `.github/workflows/deploy.yml`
and `db-ops.yml`.

## Checks

`pnpm type-check`, `pnpm lint`, `pnpm test`. CI: `.github/workflows/deploy.yml`
(checks only; deploys are done by Vercel and Render).
