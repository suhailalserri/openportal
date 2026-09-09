FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ─── Install dependencies (cached separately from source for faster rebuilds) ──
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json       ./packages/db/
COPY packages/types/package.json    ./packages/types/
COPY packages/config/package.json   ./packages/config/
COPY apps/api/package.json          ./apps/api/
RUN pnpm install --no-frozen-lockfile --prod=false

# Bring in real source AFTER install, so each workspace package's own
# node_modules (created by the install above) is never overwritten.
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# ─── Runtime image ─────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app ./
EXPOSE 4000
# Runs apps/api's own "start" script (tsx src/index.ts) with the correct
# cwd and PATH set up by pnpm's --filter, instead of a hardcoded binary path.
CMD ["pnpm", "--filter", "@ai-platform/api", "start"]
