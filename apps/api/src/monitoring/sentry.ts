/**
 * apps/api/src/monitoring/sentry.ts (plan P2.1, closes G3; decision L5, L12)
 *
 * The ONLY file that imports `@sentry/node`. Imported by index.ts alone, never
 * by services (see error-hook.ts for why).
 *
 * Posture:
 *   - No DSN (or a bad one) => nothing is initialised, nothing is registered.
 *   - Errors only: no tracing, no breadcrumbs (console breadcrumbs would carry
 *     log lines, e.g. billing messages), no default PII.
 *   - Every event passes `apiBeforeSend` (shared scrubber, fail-closed).
 *   - init and capture are wrapped: Sentry being down or misconfigured can
 *     never affect /chat or /trpc.
 */
import * as Sentry from "@sentry/node";
import {
  API_SERVICE_TAG,
  apiBeforeSend,
  normalizeDsn,
  resolveEnvironment,
  resolveRelease,
} from "./options";
import { setErrorSink, type ErrorContext } from "./error-hook";

let enabled = false;

export function isSentryEnabled(): boolean {
  return enabled;
}

/** Returns true if the SDK was initialised. Never throws. */
export function initSentry(env: Record<string, string | undefined> = process.env): boolean {
  if (enabled) return true;
  const raw = env.SENTRY_DSN;
  const dsn = normalizeDsn(raw);
  if (!dsn) {
    if (typeof raw === "string" && raw.trim() !== "") {
      console.warn("[sentry] SENTRY_DSN is set but is not a valid https URL — monitoring is OFF.");
    }
    return false;
  }
  try {
    const release = resolveRelease(env);
    Sentry.init({
      dsn,
      environment: resolveEnvironment(env),
      ...(release ? { release } : {}),
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      // tracesSampleRate intentionally omitted => tracing off (errors only).
      initialScope: { tags: { service: API_SERVICE_TAG } },
      beforeSend: apiBeforeSend,
      beforeBreadcrumb: () => null,
      // process.on("unhandledRejection") is installed once, by us, in
      // process-handlers.ts (with a defined "capture and continue" policy).
      integrations: (defaults) => defaults.filter((i) => i.name !== "OnUnhandledRejection"),
    });
    enabled = true;
    setErrorSink(captureApiError);
    return true;
  } catch (err) {
    console.error("[sentry] init failed — monitoring is OFF:", err instanceof Error ? err.message : err);
    enabled = false;
    setErrorSink(null);
    return false;
  }
}

export function captureApiError(error: unknown, context?: ErrorContext): void {
  try {
    if (!enabled) return;
    Sentry.captureException(error, context?.tags ? { tags: context.tags } : undefined);
  } catch {
    // best-effort
  }
}

/**
 * P3.2: flush queued events before the process exits (shutdown is the moment
 * the last errors of this instance are most likely still buffered).
 * Bounded, never throws, a no-op when Sentry is off.
 */
export async function flushSentry(timeoutMs = 2_000): Promise<void> {
  try {
    if (!enabled) return;
    await Sentry.flush(timeoutMs);
  } catch {
    // best-effort
  }
}

