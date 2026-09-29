/**
 * apps/api/src/lifecycle/shutdown.ts (plan P3.2, closes N2)
 *
 * Graceful shutdown for the API. Dependency-free on purpose (no config, no db,
 * no Redis import): everything it touches is injected, so it is unit-testable
 * with fake timers and cannot itself fail to import.
 *
 * WHY: before P3.2 nothing listened for SIGTERM. A Render deploy killed every
 * in-flight /chat stream instantly. The billing + message-save code that runs
 * AFTER the stream never ran, so the user got a free reply and the message was
 * lost.
 *
 * TIMELINE (defaults; total must stay under Render's shutdown delay, 120 s):
 *
 *   t=0        SIGTERM. `draining` = true. New billed requests get a retryable
 *              503 (Retry-After). /ready flips to 503. /health stays 200.
 *   t<=drain   Wait for in-flight billed operations to finish on their own.
 *   t=drain    (90 s) Still running? ABORT them. streamChat treats an abort as
 *              a partial stream and bills the content received so far
 *              (existing path, exactly once). Wait up to `abortGrace` (15 s)
 *              for that billing/saving to finish.
 *   then       Run the closers in order (http, workers, queues, redis, db,
 *              sentry), each bounded by `closerTimeout`; one throwing or
 *              hanging closer never blocks the rest.
 *   hard exit  `hardExit` after t=0 => exit(1). Last resort only.
 *
 * WHAT THIS CANNOT DO: after SIGKILL no code runs. Anything still executing
 * when Render kills the process is unbilled. That is why the abort happens
 * ~15 s BEFORE the deadline instead of relying on a handler that cannot run.
 */

export interface ShutdownOperation {
  /** Aborted by the controller when the drain deadline passes. */
  readonly signal: AbortSignal;
  /** Idempotent. MUST be called (use `finally`) once billing is done. */
  end(): void;
}

export interface ShutdownCloser {
  name: string;
  close: () => Promise<unknown> | unknown;
}

export type ShutdownLogLevel = "info" | "warn" | "error";

export interface ShutdownOptions {
  drainMs: number;
  abortGraceMs: number;
  closerTimeoutMs: number;
  hardExitMs: number;
  /** Evaluated at shutdown time so late-created resources (workers) are included. */
  closers: () => ShutdownCloser[];
  exit: (code: number) => void;
  log?: ((level: ShutdownLogLevel, message: string) => void) | undefined;
  /** Called once when streams are aborted at the deadline. */
  onAbort?: ((count: number) => void) | undefined;
}

export interface ShutdownController {
  beginOperation(): ShutdownOperation | null;
  isDraining(): boolean;
  inFlight(): number;
  /** Idempotent: a second SIGTERM returns the same promise and does nothing. */
  shutdown(reason: string): Promise<void>;
}

export const SHUTDOWN_DEFAULTS = {
  drainMs:         90_000,
  abortGraceMs:    15_000,
  closerTimeoutMs:  3_000,
  /** Budget for all closers on top of drain + grace. */
  closeBudgetMs:   12_000,
} as const;

function readMs(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * Reads SHUTDOWN_DRAIN_MS / SHUTDOWN_ABORT_GRACE_MS from the environment.
 * Bad values fall back to the default (a typo must not disable the drain).
 * hardExitMs is always drain + grace + the close budget, so the phases can
 * never be cut off by the hard timer while they are still on schedule.
 */
export function shutdownTimingFromEnv(
  env: Record<string, string | undefined> = process.env,
): Pick<ShutdownOptions, "drainMs" | "abortGraceMs" | "closerTimeoutMs" | "hardExitMs"> {
  const drainMs      = readMs(env.SHUTDOWN_DRAIN_MS, SHUTDOWN_DEFAULTS.drainMs, 1_000, 240_000);
  const abortGraceMs = readMs(env.SHUTDOWN_ABORT_GRACE_MS, SHUTDOWN_DEFAULTS.abortGraceMs, 1_000, 60_000);
  return {
    drainMs,
    abortGraceMs,
    closerTimeoutMs: SHUTDOWN_DEFAULTS.closerTimeoutMs,
    hardExitMs:      drainMs + abortGraceMs + SHUTDOWN_DEFAULTS.closeBudgetMs,
  };
}

function withTimeout(work: Promise<unknown>, ms: number): Promise<"done" | "timeout"> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    work.then(
      () => { clearTimeout(timer); resolve("done"); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export function createShutdownController(opts: ShutdownOptions): ShutdownController {
  const log = opts.log ?? (() => {});
  const operations = new Set<{ controller: AbortController }>();
  const idleWaiters = new Set<() => void>();
  let draining = false;
  let running: Promise<void> | null = null;

  const notifyIfIdle = (): void => {
    if (operations.size > 0) return;
    for (const wake of [...idleWaiters]) wake();
  };

  /** Resolves true when nothing is in flight, false if `ms` elapses first. */
  const waitForIdle = (ms: number): Promise<boolean> =>
    new Promise((resolve) => {
      if (operations.size === 0) { resolve(true); return; }
      const wake = (): void => {
        clearTimeout(timer);
        idleWaiters.delete(wake);
        resolve(true);
      };
      const timer = setTimeout(() => {
        idleWaiters.delete(wake);
        resolve(false);
      }, ms);
      idleWaiters.add(wake);
    });

  const beginOperation = (): ShutdownOperation | null => {
    if (draining) return null;
    const entry = { controller: new AbortController() };
    operations.add(entry);
    let ended = false;
    return {
      signal: entry.controller.signal,
      end: () => {
        if (ended) return;
        ended = true;
        operations.delete(entry);
        notifyIfIdle();
      },
    };
  };

  const run = async (reason: string): Promise<void> => {
    draining = true;
    log("info", `[shutdown] ${reason}: draining (${operations.size} in flight, drain ${opts.drainMs} ms)`);

    const hardTimer = setTimeout(() => {
      log("error", `[shutdown] hard exit after ${opts.hardExitMs} ms (${operations.size} operation(s) abandoned)`);
      opts.exit(1);
    }, opts.hardExitMs);
    hardTimer.unref?.();

    let abandoned = 0;
    try {
      if (!(await waitForIdle(opts.drainMs))) {
        const count = operations.size;
        log("warn", `[shutdown] drain deadline reached: aborting ${count} stream(s) so they bill what was streamed`);
        try { opts.onAbort?.(count); } catch { /* never block shutdown */ }
        for (const op of [...operations]) {
          op.controller.abort(new DOMException("Server shutting down", "AbortError"));
        }
        if (!(await waitForIdle(opts.abortGraceMs))) {
          abandoned = operations.size;
          log("error", `[shutdown] ${abandoned} operation(s) still running after the abort grace; closing anyway`);
        }
      }

      for (const closer of opts.closers()) {
        try {
          const outcome = await withTimeout(Promise.resolve().then(() => closer.close()), opts.closerTimeoutMs);
          if (outcome === "timeout") log("warn", `[shutdown] closer "${closer.name}" timed out after ${opts.closerTimeoutMs} ms`);
        } catch (err) {
          log("error", `[shutdown] closer "${closer.name}" failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      clearTimeout(hardTimer);
    }

    log("info", "[shutdown] complete");
    opts.exit(abandoned > 0 ? 1 : 0);
  };

  return {
    beginOperation,
    isDraining: () => draining,
    inFlight:   () => operations.size,
    shutdown: (reason: string) => {
      if (running) {
        log("info", `[shutdown] ${reason} ignored: shutdown already in progress`);
        return running;
      }
      running = run(reason);
      return running;
    },
  };
}

/** Minimal shape of `process` used here (tests pass an EventEmitter). */
export interface SignalSource {
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

/** SIGTERM (Render/Docker deploy) and SIGINT (Ctrl+C). Returns an uninstall function. */
export function installShutdownSignalHandlers(
  controller: ShutdownController,
  source: SignalSource = process,
): () => void {
  const onTerm = (): void => { void controller.shutdown("SIGTERM"); };
  const onInt  = (): void => { void controller.shutdown("SIGINT"); };
  source.on("SIGTERM", onTerm);
  source.on("SIGINT", onInt);
  return () => {
    source.off("SIGTERM", onTerm);
    source.off("SIGINT", onInt);
  };
}

export const SHUTTING_DOWN_BODY = {
  error:             "SERVICE_RESTARTING",
  message:           "الخدمة تُحدَّث الآن. أعد المحاولة بعد لحظات.",
  retryable:         true,
  retryAfterSeconds: 5,
} as const;
