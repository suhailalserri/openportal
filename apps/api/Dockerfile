# syntax=docker/dockerfile:1
#
# apps/api container (P3.3, closes G8). Build context = repo root.
#   docker build -f apps/api/Dockerfile .
#
# Three stages:
#   build      full install (dev deps included) + esbuild bundle -> dist/index.js
#   prod-deps  production-only install of the api's own dependencies (no tsx,
#              vitest, drizzle-kit, esbuild, typescript-tooling of our own)
#   runner     node + prod node_modules + dist. Non-root. No pnpm, no source.
#
# Base image: pinned to an exact minor line by default. For a byte-for-byte
# pin, build with
#   --build-arg NODE_IMAGE=node:20.19-alpine@sha256:<digest>
# (get the digest with `docker buildx imagetools inspect node:20.19-alpine`).
# The same arg is used by all three stages, so they can never drift apart.
ARG NODE_IMAGE=node:20.19-alpine

# ─── base: node + pnpm ─────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ─── build: install everything, bundle the api ─────────────────────────────
# NODE_ENV must NOT be "production" here: pnpm would then skip the dev
# dependencies (esbuild) that the bundle step needs.
FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json     ./packages/db/
COPY packages/types/package.json  ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY apps/api/package.json        ./apps/api/
RUN pnpm install --frozen-lockfile --prod=false

# Source comes AFTER the install (and .dockerignore drops host node_modules), so
# the install above is never overwritten and stays cached.
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm --filter @ai-platform/api build:bundle

# ─── prod-deps: production dependencies of the api only ────────────────────
# `--filter @ai-platform/api` (without `...`) installs ONLY the api importer's
# production dependencies from the lockfile. The @ai-platform/* workspace
# packages are bundled into dist/, so they and their dependencies (better-auth,
# ...) are intentionally not installed.
FROM base AS prod-deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json     ./packages/db/
COPY packages/types/package.json  ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY apps/api/package.json        ./apps/api/
RUN pnpm install --frozen-lockfile --prod --filter @ai-platform/api

# ─── runner ────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production
WORKDIR /app/apps/api

# Layout mirrors the workspace so pnpm's relative symlinks keep working:
#   /app/node_modules/.pnpm/...        (the store)
#   /app/apps/api/node_modules/<dep>   (symlinks into the store)
# The apps/api/node_modules/@ai-platform/* links dangle on purpose (bundled).
COPY --from=prod-deps /app/node_modules              /app/node_modules
COPY --from=prod-deps /app/apps/api/node_modules     /app/apps/api/node_modules
COPY --from=build     /app/apps/api/dist             /app/apps/api/dist
# `"type": "module"` lives here; dist/index.js is an ES module.
COPY --from=build     /app/apps/api/package.json     /app/apps/api/package.json

# The official node image ships a `node` user (uid 1000). The app writes
# nothing to disk, so root-owned read-only files are fine.
USER node

EXPOSE 4000

# Render ignores Docker HEALTHCHECK and uses its own health check path (set it
# to /health). This one covers `docker run` / CI and any other orchestrator.
# /health is liveness only (no DB/Redis), so a dependency blip never marks a
# healthy process unhealthy. Node 20 has fetch; alpine has no curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/index.js"]
