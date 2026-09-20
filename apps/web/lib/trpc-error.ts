/**
 * Phase 2.2 (docs/FRONTEND_REBUILD_PLAN.md) — session-expired detection.
 *
 * 2.1's known gap: server layouts guard on load, but a session that
 * expires while the tab stays open on a signed-in page isn't caught
 * until the next API call. `protectedProcedure` (apps/api/src/routers/
 * trpc.ts) throws `TRPCError({ code: "UNAUTHORIZED" })` for that call;
 * on the client it arrives as a `TRPCClientErrorLike` with
 * `error.data.code === "UNAUTHORIZED"` — duck-typed here rather than
 * importing `TRPCClientError` as a class, since react-query's
 * `throwOnError` only ever hands this function a plain error value, not
 * something guaranteed to be `instanceof` anything in particular.
 *
 * Deliberately narrow: only UNAUTHORIZED counts. A wider check (any tRPC
 * error) would send transient network blips or ordinary NOT_FOUND/
 * BAD_REQUEST responses to the route's error.tsx instead of letting the
 * calling component show an inline retry — turning a small, recoverable
 * failure into a full-page error for every widget on the shell.
 *
 * Pure/dependency-free (no import from "@trpc/client" — this only reads
 * the shape, doesn't need the class) so vitest can load it without the
 * `@/` alias.
 */

export function isUnauthorizedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return false;
  return (data as { code?: unknown }).code === "UNAUTHORIZED";
}
