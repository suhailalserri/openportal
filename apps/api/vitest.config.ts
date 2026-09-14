import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Real Postgres containers take a few seconds to boot + drizzle-kit push
    // takes a few more. 30s default is too tight for that plus a full test file.
    testTimeout: 60_000,
    hookTimeout: 60_000,

    // Each test file that imports src/test/testDb.ts starts its OWN
    // Testcontainers Postgres instance (see testDb.ts). Running files in
    // parallel forks is fine (isolated containers), but keep concurrency
    // modest — spinning up too many Postgres containers at once on a laptop
    // or a small CI runner is a good way to time out on Docker itself.
    poolOptions: {
      forks: {
        maxForks: 3,
      },
    },

    include: ["src/**/*.test.ts"],
    environment: "node",

    // Fallback ONLY for test files that never call startTestDb() (e.g. the
    // streaming proxy test, which mocks balance.service entirely and never
    // issues a real query). "@ai-platform/db" throws at import time if
    // DATABASE_URL is unset at all, so this just prevents that — it's an
    // unreachable placeholder, not a real database. Files that DO call
    // startTestDb() immediately overwrite this with their container's
    // real connection string before doing anything DB-dependent.
    env: {
      DATABASE_URL: "postgres://placeholder:placeholder@localhost:1/unused",
      CODE_SALT: "test-salt-do-not-use-in-production",
      // fraud.service.ts / metrics.ts read process.env.REDIS_URL directly
      // (not through the Zod-validated ./config — see metrics.ts for why),
      // defaulting to redis://localhost:6379 if unset. Setting it explicitly
      // to an unreachable port here isn't required to avoid a crash anymore,
      // but keeps test behavior deterministic regardless of whether the
      // machine running tests happens to have a real Redis on 6379 — every
      // fraud/metrics call site fails OPEN on a connection error, so this
      // guarantees "check skipped" rather than "check silently succeeds
      // against a Redis instance the test never provisioned."
      REDIS_URL: "redis://localhost:1/0",
    },
  },
});
