/**
 * P3.5 (closes N6): admin two-factor gate.
 *
 * `adminProcedure` (routers/trpc.ts) calls `checkAdminTwoFactor` after the role
 * and account-status checks. It is OFF unless ADMIN_REQUIRE_2FA is exactly
 * "true" (case-insensitive, trimmed): a typo, a blank value or an unset
 * variable never locks anyone out. The same code runs in BOTH the api (Render)
 * and the web app (Vercel, in-process), so the variable must be set on both.
 *
 * Reads `process.env` at call time instead of importing ../config on purpose:
 * config.ts throws when unrelated variables are missing, and this file must be
 * importable (and testable) on its own.
 *
 * Stable error code for the frontend to map to copy: ADMIN_2FA_REQUIRED.
 */

export const ADMIN_2FA_REQUIRED_CODE = "ADMIN_2FA_REQUIRED" as const;

export function isAdminTwoFactorRequired(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.ADMIN_REQUIRE_2FA ?? "").trim().toLowerCase() === "true";
}

export type AdminTwoFactorCheck =
  | { ok: true }
  | { ok: false; reason: typeof ADMIN_2FA_REQUIRED_CODE };

/**
 * `user.twoFactorEnabled` comes from the full users row that both context
 * builders read fresh from the DB on every request. Anything other than a
 * literal `true` (false, null, undefined) counts as "not enrolled".
 */
export function checkAdminTwoFactor(
  user: { twoFactorEnabled?: boolean | null },
  env: Record<string, string | undefined> = process.env,
): AdminTwoFactorCheck {
  if (!isAdminTwoFactorRequired(env)) return { ok: true };
  return user.twoFactorEnabled === true
    ? { ok: true }
    : { ok: false, reason: ADMIN_2FA_REQUIRED_CODE };
}

/** Boot-time message for the api (undefined when nothing to say). */
export function adminTwoFactorBootWarning(
  nodeEnv: string | undefined,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  if (nodeEnv !== "production" || isAdminTwoFactorRequired(env)) return undefined;
  return (
    "⚠️ ADMIN_REQUIRE_2FA is not 'true': admin procedures do NOT require two-factor. " +
    "Enrol 2FA on every admin, then set it on BOTH Render and Vercel (docs/runbooks/SECURITY_SWEEP.md)."
  );
}
