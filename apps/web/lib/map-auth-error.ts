/**
 * better-auth client errors carry a `status` (HTTP-like) and sometimes a
 * `code`; mapped here to the `auth.errors.*` copy already in
 * messages/*.json. Shared by login/register/forgot/reset (Phase 3.1) so
 * each page doesn't re-guess status codes independently.
 *
 * NOT exhaustive against better-auth's real error surface — the specific
 * `code` strings checked here (CAPTCHA_FAILED, WEAK_PASSWORD) are the
 * ones lib/auth.ts (frozen) is confirmed to throw itself; anything else
 * falls through to status-code buckets or the generic message. Could not
 * verify this against better-auth's actual error-shape types without
 * node_modules in this environment — flagged in BRANCH_AND_CI_NOTES.md.
 */
export function mapAuthError(
  error: { status?: number; code?: string; message?: string },
  t: (key: string) => string
): string {
  if (error.code === "CAPTCHA_FAILED") return t("errors.captchaFailed");
  if (error.code === "WEAK_PASSWORD") return t("errors.weakPassword");
  if (error.status === 429) return t("errors.tooManyAttempts");
  if (error.status === 401 || error.status === 400) return t("errors.invalidCredentials");
  return t("errors.generic");
}
