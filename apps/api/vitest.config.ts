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
    },
  },
});
