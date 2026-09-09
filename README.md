# AI Aggregator Platform

Multi-tenant AI platform — monorepo with Next.js (web), Fastify (API), Drizzle + PostgreSQL, Redis, and a New API gateway.

## Quick Start (Development)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and fill env vars
cp .env.example .env
# Edit .env — minimum required: DATABASE_URL, REDIS_URL, GATEWAY_URL,
#   GATEWAY_MASTER_KEY, BETTER_AUTH_SECRET, INTERNAL_SERVICE_TOKEN,
#   RESEND_API_KEY, RESEND_FROM_EMAIL, CODE_SALT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY

# 3. Start infrastructure
docker compose -f infra/docker-compose.yml up -d postgres redis minio

# 4. Run schema migrations
pnpm db:migrate

# 5. Apply post-migration constraints & indexes (run once after first migrate)
psql $DATABASE_URL < packages/db/src/migrations/0001_constraints.sql

# 6. Seed dev data
pnpm db:seed           # admin + test user + sample redeem codes
pnpm db:seed:models    # sync model catalog → DB (required for chat to work)

# 7. Start the apps
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- New API gateway: http://localhost:3001
- MinIO console: http://localhost:9001

## Production Deployment

```bash
# Build Docker images
docker compose -f infra/docker-compose.yml build

# Start all services
docker compose -f infra/docker-compose.yml up -d

# Run migrations on the live DB (after each deploy)
docker compose exec api pnpm db:migrate
docker exec -i $(docker compose ps -q postgres) psql -U postgres ai_platform \
  < packages/db/src/migrations/0001_constraints.sql

# Seed models on first deploy
docker compose exec api pnpm --filter @ai-platform/db seed:models
```

See `docs/LAUNCH_CHECKLIST.md` for the full pre-launch task list.

## Architecture

```
apps/
  web/     Next.js 15 — UI + tRPC server (inline) + streaming proxy to API
  api/     Fastify — streaming /chat endpoint + background workers (BullMQ)
packages/
  db/      Drizzle ORM schema, migrations, seed scripts
  config/  MODEL_CATALOG, pricing constants, shared config
  types/   Shared TypeScript types
infra/
  docker-compose.yml   All services (postgres, redis, gateway, minio, caddy, grafana)
  postgres/init.sql    DB init (extensions + trigger function only)
  migrations/          Post-migrate SQL (constraints, indexes, cron jobs)
```

## Testing

Money-movement code (`deductCreditsAtomic`, `creditBalance`, `redeemCode`) is tested against a
**real, ephemeral PostgreSQL 16 container** via [Testcontainers](https://node.testcontainers.org/) —
not a mock of the database layer. This is deliberate: the thing actually being tested is Postgres-level
atomicity (the `credits >= 0` constraint, the unique partial index on unused redeem codes, transaction
rollback behavior), which a mocked DB client cannot verify.

**Requires Docker running locally** (or in CI). No other setup — each test file spins up its own
container, pushes the current Drizzle schema into it, and tears it down afterward.

```bash
cd apps/api
pnpm test              # run once
pnpm test:watch        # watch mode
```

What's covered so far:

| File | Covers |
|---|---|
| `balance.service.test.ts` | `deductCreditsAtomic` race condition (10 concurrent deductions against insufficient balance — only as many succeed as the balance allows, never negative), `creditBalance`, nested-transaction rollback via the injected `tx` executor |
| `redeem.service.test.ts` | Checksum format validation with 10,000 random invalid codes (asserts **zero** DB calls), full `redeemCode` happy/error paths, concurrent redemption of the same code by 8 different users (exactly 1 succeeds) |
| `fraud.service.test.ts` | Velocity/spend/redeem-attempt thresholds, property-style random burst generation (every burst >20 req/min is blocked, every sequence ≤20 is never blocked), critical-severity auto-suspend |
| `gateway.service.test.ts` | Streaming proxy: unbuffered chunk passthrough (mocked upstream SSE), billing fires exactly once per completed stream, partial-stream billing on interruption, no billing on upstream failure |

Still to add: tRPC router integration tests (real HTTP requests against a running Fastify instance,
verifying Zod validation + auth middleware rejection) — not yet written.

## Key Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps |
| `pnpm db:migrate` | Run Drizzle schema migrations |
| `pnpm db:seed` | Seed admin user + redeem codes |
| `pnpm db:seed:models` | Sync MODEL_CATALOG → models table |
| `pnpm type-check` | TypeScript check all packages |
| `pnpm lint` | ESLint all packages |
