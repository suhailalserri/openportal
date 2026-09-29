# API container (plan P3.3, closes G8)

Render runs `apps/api/Dockerfile` (Docker runtime, build context = repo root, no Docker Command override, so the image's `CMD` is what starts the service).

## What the image is

| | |
|---|---|
| Start command | `node --enable-source-maps dist/index.js` (same as `pnpm --filter @ai-platform/api start:prod`) |
| User | `node` (uid 1000), never root |
| Contents | `dist/index.js` (+ sourcemap), production `node_modules` of the api only. No source, no `packages/`, no pnpm, no tsx, no vitest/drizzle-kit/esbuild |
| Bundled in | `@ai-platform/db`, `config`, `types`, and `postgres` |
| Left external | everything in `apps/api` `dependencies` (fastify, bullmq, ioredis, @sentry/node, drizzle-orm, ...) |
| Health | `HEALTHCHECK` -> `GET /health` (liveness, no DB/Redis). Render ignores it; Render's own **Health Check Path must stay `/health`** |
| Signals | `node` is PID 1, so Render's SIGTERM reaches the P3.2 shutdown controller directly (before, it went through pnpm and tsx) |

`pnpm start` (tsx on source) still works for local use. Local bundle: `pnpm --filter @ai-platform/api build:bundle && pnpm --filter @ai-platform/api start:prod`.

## Adding a dependency to the api

1. Add it to `apps/api/package.json` **`dependencies`** (not dev) and commit the lockfile.
2. That is all: `build.mjs` reads `dependencies` to decide what stays external. An import that is in neither `dependencies` nor the workspace makes `build:bundle` fail in CI ("Could not resolve"), not on boot.

## Owner checks after the first deploy of this change

1. **Render > api > Settings > Deploy:** the *Pre-Deploy Command* must be empty (the runtime image has no pnpm). Migrations run from GitHub Actions (`db-migrate.yml`), not from the api container.
2. Prefer *Auto-Deploy: After CI Checks Pass* so a red `API Docker Image` job never reaches Render. Without it Render builds on push without waiting for CI.
3. Deploy is green and `/health` is 200. Then the 25-request `/chat` smoke test from P3.1 (20 pass, then 429).
4. Trigger the Sentry smoke test from P2.1 and confirm the event arrives (bundling must not have changed Sentry).
5. Render *Shell* now has `node` and `sh` only, no `pnpm`. Use the GitHub workflows for DB operations.

## Rollback

Render > api > Deploys > previous deploy > *Rollback*. The previous image ran `tsx` on source as root; nothing in the database or config changed, so rolling back is safe.

## Pinning the base image by digest

The Dockerfile pins `node:20.19-alpine` by tag. For a digest pin, change the `ARG NODE_IMAGE=` default in `apps/api/Dockerfile` to `node:20.19-alpine@sha256:<digest>` (digest from `docker buildx imagetools inspect node:20.19-alpine`). Re-pin on a schedule: a digest pin stops receiving Alpine/Node security patches until you update it.

## Known follow-up

Node 20 reached end of life on 2026-04-30. Moving CI (`NODE_VERSION`), `engines`, this Dockerfile and Vercel to Node 22 is a separate, deliberate change (it touches the frozen web runtime setting), so it was not done here.
