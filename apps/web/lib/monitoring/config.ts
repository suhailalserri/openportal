/**
 * apps/web/lib/monitoring/config.ts (Phase 9.2b)
 *
 * PURE helpers for error monitoring — deliberately no `@sentry/*` import so
 * vitest can load this file and so a bug here can never take the SDK down
 * with it. Everything that decides WHAT leaves the browser/server lives here:
 *
 *   - isMonitoringEnabled: no DSN ⇒ monitoring is fully off (CI, e2e, local).
 *   - shouldIgnoreError:   expected/user-caused failures never become issues.
 *   - scrubEvent:          strips cookies, auth headers, request bodies,
 *                          query strings, emails, bearer tokens and redeem-code
 *                          shaped strings before an event is sent.
 *   - beforeSend:          the Sentry hook that applies the two above.
 *
 * P2.1: redaction, the ignore list and scrubEvent now live in ONE shared,
 * pure module (packages/config/src/monitoring-scrub.ts) that apps/api also
 * uses, so the two tiers cannot drift. They are re-exported here so every
 * existing import of this file keeps working. Behaviour is a strict superset:
 * it additionally drops `extra`, `request.env` and stack-frame `vars`,
 * deep-redacts `contexts`/`tags`, redacts sk-* API keys and caps exception
 * messages at 500 chars.
 *
 * Privacy contract (mirrors docs/legal/PRIVACY_POLICY.md §3): no message
 * content, no cookies, no request bodies. Chat prompts are never captured
 * because bodies are dropped and Session Replay is not enabled.
 */

import { scrubEvent, shouldIgnoreError } from "@ai-platform/config/monitoring-scrub";

export {
  IGNORED_TRPC_CODES,
  redactText,
  scrubEvent,
  scrubUrl,
  shouldIgnoreError,
} from "@ai-platform/config/monitoring-scrub";

/** DSN is public by design (NEXT_PUBLIC_*). Unset/malformed ⇒ monitoring off.
 * Type predicate so callers can pass the narrowed `string` to Sentry.init
 * (exactOptionalPropertyTypes rejects `string | undefined` for `dsn?: string`). */
export function isMonitoringEnabled(dsn: string | undefined | null): dsn is string {
  if (typeof dsn !== "string" || dsn.trim() === "") return false;
  try {
    return new URL(dsn.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

/** tRPC query keys look like [["billing","getBalance"], {input,type}].
 * Returns "billing.getBalance" — the procedure path only, never the input. */
export function procedureFromKey(queryKey: readonly unknown[] | undefined): string | undefined {
  const first = queryKey?.[0];
  if (Array.isArray(first) && first.length > 0 && first.every((p) => typeof p === "string")) {
    return first.join(".");
  }
  return undefined;
}

/** Sentry `beforeSend`: drop expected errors, scrub the rest. */
export function beforeSend<T>(event: T, hint?: { originalException?: unknown }): T | null {
  if (hint && shouldIgnoreError(hint.originalException)) return null;
  return scrubEvent(event);
}

/** One env var for both runtimes; set to "preview" on Vercel Preview. */
export function monitoringEnvironment(): string {
  return process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production";
}
