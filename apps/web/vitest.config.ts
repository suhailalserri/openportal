import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Presence of this file (checked by .github/workflows/deploy.yml's
 * `web-unit` job) is what flips that job from a no-op to real. Tests
 * here were pure logic (formatCredits, the ESLint rule) through Phase 3
 * — no DOM needed, so `environment: "node"` was enough and avoided
 * adding jsdom as a dependency.
 *
 * Phase 4a is the first phase to actually RENDER a React component tree
 * in a test (components/markdown/safe-markdown.test.tsx, via
 * react-dom/server's renderToStaticMarkup — see that file's own header
 * comment for why: adding @testing-library/react + jsdom would mean a
 * pnpm-lock.yaml regen this sandbox has no way to run, same constraint
 * as docs/frontend/BRANCH_AND_CI_NOTES.md's B1 hotfix #1). Rendering
 * still needs no DOM (renderToStaticMarkup is SSR-safe), so
 * `environment: "node"` stays — but the component tree it renders
 * imports internal modules via the `@/*` alias (tsconfig.json's
 * `paths`), which Vite/Vitest does NOT read automatically the way
 * Next.js's own bundler does. Every test before this phase avoided the
 * alias entirely (see features/legal/lib/registry.test.ts's own header
 * comment, and config/nav.test.ts) precisely because nothing forced this
 * to be solved before now. Resolving it here, once, for every test
 * going forward, rather than passing relative imports through every
 * component's own file (which would fight this codebase's established
 * `@/` convention everywhere else).
 */
const WEB_ROOT = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": WEB_ROOT,
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "app/[locale]/dev/kitchen-sink/**"],
  },
});
