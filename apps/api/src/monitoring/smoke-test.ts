/**
 * apps/api/src/monitoring/smoke-test.ts (plan P2.1 "done when")
 *
 * POST /internal/sentry-test — there is no staging environment, so the
 * "deliberate error appears in Sentry within a minute" check runs against the
 * real service. Safe to leave enabled: it requires the INTERNAL_SERVICE_TOKEN
 * (the same secret web uses to call the api), so it adds no public surface, and
 * it only throws a clearly labelled error.
 */
import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s: string) => createHash("sha256").update(s).digest();

/** `header` is the raw Authorization header value. Equal-length digests => timingSafeEqual. */
export function isAuthorizedSmokeTest(
  header: string | undefined,
  token: string,
  previousToken?: string | undefined,
): boolean {
  if (!header || !token) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m || m[1] === undefined) return false;
  const okCurrent = timingSafeEqual(sha(m[1]), sha(token));
  // P3.4: the rotation-overlap token is honoured only if it is a real secret.
  const usablePrevious = !!previousToken && previousToken.length >= 32 && previousToken !== token;
  const okPrevious = usablePrevious && timingSafeEqual(sha(m[1]), sha(previousToken));
  return okCurrent || okPrevious;
}

export function smokeTestError(now: Date = new Date()): Error {
  return new Error(`Sentry smoke test ${now.toISOString()} (deliberate; safe to ignore)`);
}
