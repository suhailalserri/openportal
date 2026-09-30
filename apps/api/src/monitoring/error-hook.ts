/**
 * apps/api/src/monitoring/error-hook.ts (plan P2.1)
 *
 * A dependency-free seam between "something went wrong" and "tell Sentry".
 *
 * Why it exists: `services/*` are also bundled into apps/web (Vercel) through
 * `@ai-platform/api/...` imports. If a service imported `@sentry/node`
 * directly, `next build` would drag a second Sentry SDK into the web bundle.
 * Services call `reportError()` (this file: no imports at all); only
 * `monitoring/sentry.ts`, imported by `index.ts` alone, registers a sink.
 *
 * Contract (L12 — fail open): reportError NEVER throws and NEVER awaits.
 * With no sink registered (web in-process, tests, no DSN) it is a no-op.
 */

export interface ErrorContext {
  /** Low-cardinality labels only (route pattern, queue name). Never user data. */
  tags?: Record<string, string>;
}

export type ErrorSink = (error: unknown, context?: ErrorContext) => void;

let sink: ErrorSink | null = null;

export function setErrorSink(next: ErrorSink | null): void {
  sink = next;
}

export function hasErrorSink(): boolean {
  return sink !== null;
}

export function reportError(error: unknown, context?: ErrorContext): void {
  try {
    sink?.(error, context);
  } catch {
    // Reporting is best-effort by design.
  }
}
