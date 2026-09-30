/**
 * P3.5 — the admin 2FA gate lives in tRPC's `adminProcedure`. A REST route
 * under apps/web/app/api that does its own role check would bypass it (that is
 * exactly what the eight deleted /api/admin/** routes did). This test keeps it
 * from happening again:
 *   1. there is no apps/web/app/api/admin directory;
 *   2. any route file that tests for the admin / superadmin role must also call
 *      checkAdminTwoFactor.
 * If you genuinely need an admin REST route, gate it with checkAdminTwoFactor
 * (import from "@ai-platform/api/security/admin-2fa").
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const WEB_API = fileURLToPath(new URL("../../../web/app/api", import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return /route\.(ts|tsx|js)$/.test(name) ? [path] : [];
  });
}

describe("REST routes cannot bypass the admin 2FA gate", () => {
  it("finds the web api directory (guards against a silently vacuous test)", () => {
    expect(existsSync(WEB_API)).toBe(true);
    expect(routeFiles(WEB_API).length).toBeGreaterThan(5);
  });

  it("the legacy apps/web/app/api/admin tree is gone", () => {
    expect(existsSync(join(WEB_API, "admin"))).toBe(false);
  });

  it("every route that checks for an admin role also calls checkAdminTwoFactor", () => {
    const offenders = routeFiles(WEB_API)
      .filter((file) => {
        const src = readFileSync(file, "utf8");
        const checksAdminRole =
          /["']superadmin["']/.test(src) || /role\s*(===|!==|==|!=)\s*["']admin["']/.test(src) ||
          /\[\s*["']admin["']/.test(src) || /isAdminRole\s*\(/.test(src);
        return checksAdminRole && !src.includes("checkAdminTwoFactor");
      })
      .map((f) => relative(WEB_API, f));
    expect(offenders, `REST route(s) check the admin role without the 2FA gate:\n${offenders.join("\n")}`).toEqual([]);
  });
});
