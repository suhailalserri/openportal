/**
 * Role vocabulary shared by the route guards (lib/guards.ts) and the
 * sidebar config (config/nav.ts). Mirrors `userRoleEnum` in
 * packages/db/src/schema/enums.ts: "user" | "admin" | "superadmin".
 *
 * Pure module (no imports) so vitest can load it without the `@/` alias.
 */
export const ADMIN_ROLES = ["admin", "superadmin"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type AppRole = "user" | AdminRole;

export function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === "string" && (ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Anything that isn't a recognised admin role is treated as a plain user.
 * Fails closed: an unexpected or missing role never widens access.
 */
export function normalizeRole(role: unknown): AppRole {
  return isAdminRole(role) ? role : "user";
}
