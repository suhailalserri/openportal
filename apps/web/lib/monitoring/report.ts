import * as Sentry from "@sentry/nextjs";

import { isMonitoringEnabled, shouldIgnoreError } from "./config";

/**
 * apps/web/lib/monitoring/report.ts (Phase 9.2b)
 *
 * The ONE call site for manual error reports (error boundaries, the
 * react-query caches). Contract:
 *   - never throws — a failing reporter must not turn one error into a
 *     blank page inside an error boundary;
 *   - no-op when NEXT_PUBLIC_SENTRY_DSN is unset;
 *   - expected errors (see shouldIgnoreError) are dropped here as well as
 *     in beforeSend, so they never even build an event.
 * `tags` must be low-cardinality and free of user data (procedure path,
 * boundary name) — never inputs, emails or message text.
 */
export function reportError(
  error: unknown,
  context: { source: string; tags?: Record<string, string> }
): void {
  try {
    if (!isMonitoringEnabled(process.env.NEXT_PUBLIC_SENTRY_DSN)) return;
    if (shouldIgnoreError(error)) return;
    const digest =
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest?: unknown }).digest ?? "")
        : "";
    Sentry.captureException(error, {
      tags: { source: context.source, ...(digest ? { digest } : {}), ...context.tags },
    });
  } catch {
    // Reporting is best-effort by design.
  }
}
