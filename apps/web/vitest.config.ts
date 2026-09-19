import { defineConfig } from "vitest/config";

/**
 * Presence of this file (checked by .github/workflows/deploy.yml's
 * `web-unit` job) is what flips that job from a no-op to real. Tests
 * here are pure logic (formatCredits, the ESLint rule) — no DOM needed,
 * so `environment: "node"` is enough and avoids adding jsdom as a dep.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "app/[locale]/dev/kitchen-sink/**"],
  },
});
