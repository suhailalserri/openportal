// P3.3 - keep only what the api can actually load.
//
// `pnpm install --prod --filter @ai-platform/api` also leaves the production
// tree of the workspace packages (db -> better-auth -> peers such as
// drizzle-kit, vitest, esbuild) in node_modules/.pnpm, even though those
// packages are bundled into dist/ and never loaded. This script walks the
// symlink graph from apps/api/node_modules (the api's own dependencies, and
// their dependencies via each store entry's sibling symlinks) and deletes every
// store entry that is not reachable. Nothing reachable is touched, so nothing
// the api can require is removed.
//
// Usage: node prune-store.mjs <workspace-root>   (e.g. /app)
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "/app");
const store = path.join(root, "node_modules", ".pnpm");
const apiModules = path.join(root, "apps", "api", "node_modules");

if (!existsSync(store)) throw new Error(`no pnpm store at ${store}`);
if (!existsSync(apiModules)) throw new Error(`no ${apiModules}`);

/** Entries of a node_modules dir, expanding @scope folders. */
function* entries(nm) {
  for (const name of readdirSync(nm)) {
    if (name === ".bin" || name === ".pnpm") continue;
    const full = path.join(nm, name);
    if (name.startsWith("@")) {
      for (const sub of readdirSync(full)) yield path.join(full, sub);
    } else {
      yield full;
    }
  }
}

/** ".../.pnpm/<key>/node_modules/<pkg>" -> "<key>", or null if outside the store. */
function storeKey(realPath) {
  const rel = path.relative(store, realPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep)[0] ?? null;
}

const keep = new Set();
const queue = [];

function visit(nm) {
  if (!existsSync(nm)) return;
  for (const entry of entries(nm)) {
    let real;
    try { real = realpathSync(entry); } catch { continue; } // dangling (@ai-platform/* links): skip
    const key = storeKey(real);
    if (key && !keep.has(key)) { keep.add(key); queue.push(key); }
  }
}

visit(apiModules);
while (queue.length) visit(path.join(store, queue.pop(), "node_modules"));

let removed = 0;
for (const name of readdirSync(store)) {
  if (name === "node_modules" || name === "lock.yaml" || name.startsWith(".")) continue;
  if (keep.has(name)) continue;
  rmSync(path.join(store, name), { recursive: true, force: true });
  removed++;
}

// Remove hoisted symlinks that now dangle, so nothing resolves into a hole.
const hoisted = path.join(store, "node_modules");
if (existsSync(hoisted)) {
  for (const entry of entries(hoisted)) {
    try { realpathSync(entry); } catch { rmSync(entry, { force: true }); }
  }
}

if (keep.size === 0) throw new Error("prune-store kept 0 packages: refusing (would empty the image)");
console.log(`prune-store: kept ${keep.size} packages, removed ${removed}`);
