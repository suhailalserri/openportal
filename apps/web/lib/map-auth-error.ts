/**
 * better-auth client errors carry a `status` (HTTP-like) and sometimes a
 * `code`; mapped here to the `auth.errors.*` copy already in
 * messages/*.json. Shared by login/register/forgot/reset (Phase 3.1) so
 * each page doesn't re-guess status codes independently.
 *
 * Param is `unknown`, not a structural `{status?, code?, message?}`
 * shape: the first real build (this repo has `exactOptionalPropertyTypes:
 * true`) showed better-auth's actual error type is
 * `{ code?: string | undefined; message?: string | undefined; status:
 * number; statusText: string }` — under that flag, an explicit
 * `string | undefined` optional isn't assignable to a plain `code?:
 * string` parameter, even though every real value is compatible at
 * runtime. `unknown` + a local safe cast avoids re-guessing the exact
 * shape a second time; if better-auth's error type changes again, this
 * still compiles (a wrong guess here fails soft — falls through to the
 * generic message — rather than failing the build again).
 *
 * NOT exhaustive against better-auth's real error surface — the specific
 * `code` strings checked here (CAPTCHA_FAILED, WEAK_PASSWORD) are the
 * ones lib/auth.ts (frozen) is confirmed to throw itself; anything else
 * falls through to status-code buckets or the generic message.
 */
export function mapAuthError(error: unknown, t: (key: string) => string): string {
  const err = (error ?? {}) as { status?: number; code?: string; message?: string };
  if (err.code === "CAPTCHA_FAILED") return t("errors.captchaFailed");
  if (err.code === "WEAK_PASSWORD") return t("errors.weakPassword");
  if (err.status === 429) return t("errors.tooManyAttempts");
  if (err.status === 401 || err.status === 400) return t("errors.invalidCredentials");
  return t("errors.generic");
}
