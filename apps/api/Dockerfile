FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json       ./packages/db/
COPY packages/types/package.json    ./packages/types/
COPY packages/config/package.json   ./packages/config/
COPY apps/api/package.json          ./apps/api/
RUN pnpm install --no-frozen-lockfile --prod=false

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules    ./node_modules
COPY --from=deps /app/packages        ./packages
COPY packages/                        ./packages/
COPY apps/api/                        ./apps/api/
EXPOSE 4000
# tsx handles TypeScript execution without a separate compile step.
# Packages are imported as .ts source via workspace:* references.
CMD ["./node_modules/.bin/tsx", "apps/api/src/index.ts"]
