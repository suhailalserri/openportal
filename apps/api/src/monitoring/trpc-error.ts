/**
 * apps/api/src/monitoring/trpc-error.ts (plan P2.1)
 *
 * tRPC `onError` reporting for the Fastify /trpc route. Only server faults
 * (INTERNAL_SERVER_ERROR) become Sentry issues: UNAUTHORIZED, FORBIDDEN,
 * BAD_REQUEST, NOT_FOUND, TOO_MANY_REQUESTS... are normal outcomes the UI
 * handles, and the P1.1 guards make them frequent by design.
 *
 * Reports the ORIGINAL error (`cause`) when tRPC wrapped one, because that
 * carries the real stack. Never passes `input`, `ctx` or `req` on.
 */
import { reportError } from "./error-hook";

export function reportTrpcError({
  error,
  path,
}: {
  error: Error;
  path: string | undefined;
}): void {
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  if (code !== "INTERNAL_SERVER_ERROR") return;
  const original = cause instanceof Error ? cause : error;
  reportError(original, { tags: { source: "trpc", procedure: path ?? "unknown" } });
}
