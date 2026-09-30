/**
 * apps/api/src/monitoring/process-handlers.ts (plan P2.1)
 *
 * POLICY (owner-approved, L12): an unhandled promise rejection is logged and
 * reported, and the process KEEPS RUNNING. Before P2.1 there was no handler, so
 * Node 20's default (crash) applied and one stray rejection in any background
 * path took paid chat down with it.
 *
 * `uncaughtException` is deliberately NOT handled here: process state is
 * unknown after one, so it still exits (Render restarts it). With a DSN set,
 * Sentry's own uncaught-exception integration reports it and flushes first.
 */
import { reportError } from "./error-hook";

export function handleUnhandledRejection(reason: unknown): void {
  const err = reason instanceof Error ? reason : new Error(`Unhandled rejection: ${String(reason)}`);
  console.error("[unhandledRejection]", err.message);
  reportError(err, { tags: { source: "unhandledRejection" } });
}

/** Installs the handler once. Returns an uninstall function (used by tests). */
export function installProcessErrorHandlers(): () => void {
  process.on("unhandledRejection", handleUnhandledRejection);
  return () => {
    process.off("unhandledRejection", handleUnhandledRejection);
  };
}
