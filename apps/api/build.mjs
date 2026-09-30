// P3.3 - production bundle for the api container.
//
// Why a bundle and not `tsc`: the workspace packages (@ai-platform/db, config,
// types) export TypeScript SOURCE (`"exports": "./src/index.ts"`), so tsc output
// cannot run on its own. esbuild inlines them (and `postgres`, which is only a
// devDependency of the api but is imported at runtime by the bundled db code).
//
// What stays external: every package in apps/api `dependencies` (fastify,
// bullmq, ioredis, @sentry/node, drizzle-orm, ...). The runtime image installs
// exactly those, from the lockfile, with `pnpm install --prod`. Sentry and
// OpenTelemetry therefore load from node_modules as they do today, never bundled.
//
// Anything imported that is neither a `dependency` nor resolvable in the
// workspace makes this build FAIL (esbuild "Could not resolve"), which is the
// point: a missing runtime dependency is caught in CI, not at 3 AM on boot.
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const external = Object.keys(pkg.dependencies ?? {})
  .filter((name) => !name.startsWith("@ai-platform/"))
  .flatMap((name) => [name, `${name}/*`]); // subpaths too (drizzle-orm/pg-core, ...)

rmSync(new URL("./dist", import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true, // run with `node --enable-source-maps` for TypeScript stack traces
  external,
  // Inlined CommonJS code that calls require() (e.g. for node builtins) needs a
  // real `require` in an ES module.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  logLevel: "info",
});

console.log(`api bundle ready: dist/index.js (${external.length / 2} packages left external)`);
