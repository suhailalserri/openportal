/**
 * apps/api/src/monitoring/fastify-errors.ts (plan P2.1)
 *
 * Fastify-level catch-all for everything OUTSIDE tRPC: the `/chat` handler
 * (including its rethrow of non-lock errors), its preHandler (auth / rate
 * limit / dynamic imports), /health, /metrics and the smoke-test route.
 *
 * One hook instead of a try/catch per route, so a new route cannot be
 * forgotten. tRPC catches its own errors, so nothing here double-reports them.
 * Client errors (statusCode < 500: validation, 404) and aborts are skipped.
 * The route PATTERN is tagged, never the URL (URLs can carry tokens).
 */
import type { FastifyInstance } from "fastify";
import { reportError } from "./error-hook";

export function registerFastifyErrorReporting(app: FastifyInstance): void {
  app.addHook("onError", (req, _reply, error, done) => {
    try {
      const status = (error as { statusCode?: unknown }).statusCode;
      const isClientError = typeof status === "number" && status < 500;
      if (!isClientError && error.name !== "AbortError") {
        reportError(error, {
          tags: { source: "fastify", route: req.routeOptions?.url ?? "unknown", method: req.method },
        });
      }
    } catch {
      // never let reporting affect the response
    }
    done();
  });
}
