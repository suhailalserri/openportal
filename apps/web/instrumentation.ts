import * as Sentry from "@sentry/nextjs";

import { beforeSend, isMonitoringEnabled, monitoringEnvironment } from "./lib/monitoring/config";

/**
 * apps/web/instrumentation.ts (Phase 9.2b) — Next.js server/edge hook.
 *
 * Covers the WEB tier only: server components, route handlers under
 * app/api/**, and middleware, via `onRequestError`. It does NOT cover
 * apps/api (Fastify) — that needs its own backend session.
 *
 * No DSN ⇒ nothing is initialised and `captureRequestError` is a no-op,
 * so CI / e2e / local runs behave exactly as before.
 */
export function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!isMonitoringEnabled(dsn)) return;
  if (process.env.NEXT_RUNTIME !== "nodejs" && process.env.NEXT_RUNTIME !== "edge") return;

  Sentry.init({
    dsn,
    environment: monitoringEnvironment(),
    sendDefaultPii: false,
    // tracesSampleRate intentionally omitted ⇒ tracing off (errors only).
    beforeSend,
  });
}

export const onRequestError = Sentry.captureRequestError;
