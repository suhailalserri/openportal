import * as Sentry from "@sentry/nextjs";

import { beforeSend, isMonitoringEnabled, monitoringEnvironment } from "./lib/monitoring/config";

/**
 * apps/web/instrumentation-client.ts (Phase 9.2b) — browser init.
 *
 * Errors only: no Session Replay (it would record chat text), no tracing,
 * no default PII. `beforeSend` scrubs cookies/headers/bodies/query strings.
 * No DSN ⇒ the SDK is never initialised.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (isMonitoringEnabled(dsn)) {
  Sentry.init({
    dsn,
    environment: monitoringEnvironment(),
    sendDefaultPii: false,
    beforeSend,
  });
}
