/**
 * apps/api/src/monitoring/options.ts (plan P2.1)
 *
 * PURE decisions about Sentry for the api: no `@sentry/*` import, no config.ts
 * import (config.ts throws on a bad env; monitoring must be able to come up,
 * or stay off, regardless). Everything takes `env` as a parameter so tests
 * never touch process.env.
 */
import { scrubEvent, shouldIgnoreError } from "@ai-platform/config/monitoring-scrub";

type Env = Record<string, string | undefined>;

/** https DSN or undefined. Blank / malformed / http => monitoring off (never throws). */
export function normalizeDsn(raw: string | undefined | null): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  if (v === "") return undefined;
  try {
    return new URL(v).protocol === "https:" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Release = deployed git SHA. Render sets RENDER_GIT_COMMIT (all runtimes, incl. Docker). */
export function resolveRelease(env: Env): string | undefined {
  const v = env.SENTRY_RELEASE?.trim() || env.RENDER_GIT_COMMIT?.trim() || env.GITHUB_SHA?.trim();
  return v ? v : undefined;
}

export function resolveEnvironment(env: Env): string {
  return env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || "production";
}

/**
 * Sentry `beforeSend`. Drops expected errors, scrubs the rest, and FAILS
 * CLOSED: if scrubbing throws, the event is dropped rather than sent raw.
 */
export function apiBeforeSend<T>(event: T, hint?: { originalException?: unknown }): T | null {
  try {
    if (hint && shouldIgnoreError(hint.originalException)) return null;
    return scrubEvent(event);
  } catch {
    return null;
  }
}

/** Value of the `service` tag on every api event (web events are tagged by the web SDK). */
export const API_SERVICE_TAG = "api";
