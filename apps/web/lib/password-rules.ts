/**
 * Client-side mirror of the server's password rules (Phase 3.1,
 * FRONTEND_REBUILD_PLAN.md §7.1's "Breaks if wrong" note): lib/auth.ts
 * (frozen) enforces minPasswordLength: 8 plus, in its `hooks.before`
 * middleware, at least one uppercase letter and one digit — those two
 * aren't expressible via better-auth's `emailAndPassword` options on
 * the pinned version, so they live in a custom hook there instead of a
 * declarative schema this file could import.
 *
 * Mirroring instead of importing: lib/auth.ts pulls in the database
 * client and is frozen, so this NEW file re-states the same three rules
 * by hand. If the server rules ever change, this drifts silently unless
 * someone updates both — flagging that risk explicitly rather than
 * hiding it. The server is authoritative either way: this only avoids
 * spending a Turnstile verification on a password that was always going
 * to be rejected (see register/page.tsx).
 *
 * Pure module — no imports — so vitest can load it without the `@/` alias.
 */

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRuleResult {
  valid: boolean;
  /** Message keys under the `auth.errors` / `auth.passwordRules` namespace, in the order a user should fix them. */
  failedRules: Array<"minLength" | "uppercase" | "digit">;
}

export function checkPasswordRules(password: string): PasswordRuleResult {
  const failedRules: PasswordRuleResult["failedRules"] = [];
  if (password.length < PASSWORD_MIN_LENGTH) failedRules.push("minLength");
  if (!/[A-Z]/.test(password)) failedRules.push("uppercase");
  if (!/[0-9]/.test(password)) failedRules.push("digit");
  return { valid: failedRules.length === 0, failedRules };
}

/** True/false convenience for zod `.refine()`; see register/page.tsx. */
export function isValidPassword(password: string): boolean {
  return checkPasswordRules(password).valid;
}
