/**
 * apps/api/src/jobs/job-failures.ts (plan P2.3)
 *
 * Failed-job accounting for every BullMQ worker:
 *   - counts each failed attempt (metric aip_job_failures_total{queue}),
 *   - detects a BURST (>= threshold failures within the window) and raises ONE
 *     alert per cooldown, so a broken dependency gives one Telegram message,
 *     not hundreds.
 * Sentry reporting of the same event is done by monitoring/worker-errors.ts.
 *
 * Contract (L12): never throws, never awaits, never reads job.data (it holds
 * email addresses and alert text). The "alerts" queue is counted but never
 * alerts about itself (a broken Telegram alert must not enqueue more alerts).
 *
 * State is per process. With several api replicas each one alerts on its own
 * failures; that is acceptable (worst case: one message per replica).
 */

export interface FailureTrackerDeps {
  /** Increment the Prometheus counter. */
  count: (queue: string) => void;
  /** Raise an operator alert (Telegram). */
  alert: (message: string) => void;
  now?: () => number;
  burstThreshold?: number;
  windowMs?: number;
  cooldownMs?: number;
}

export interface FailureTracker {
  record: (queue: string) => void;
}

export const DEFAULT_BURST_THRESHOLD = 5;
export const DEFAULT_WINDOW_MS = 5 * 60_000;
export const DEFAULT_COOLDOWN_MS = 15 * 60_000;
const SELF_QUEUE = "alerts";

export function createFailureTracker(deps: FailureTrackerDeps): FailureTracker {
  const now = deps.now ?? Date.now;
  const threshold = deps.burstThreshold ?? DEFAULT_BURST_THRESHOLD;
  const windowMs = deps.windowMs ?? DEFAULT_WINDOW_MS;
  const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const recent = new Map<string, number[]>();
  const lastAlertAt = new Map<string, number>();

  return {
    record(queue: string): void {
      try {
        deps.count(queue);
        if (queue === SELF_QUEUE) return;

        const t = now();
        const stamps = (recent.get(queue) ?? []).filter((s) => t - s < windowMs);
        stamps.push(t);
        recent.set(queue, stamps);

        const last = lastAlertAt.get(queue);
        if (stamps.length >= threshold && (last === undefined || t - last >= cooldownMs)) {
          lastAlertAt.set(queue, t);
          deps.alert(
            `Failed-job burst: ${stamps.length} failures in ${Math.round(windowMs / 60_000)} min ` +
              `on queue "${queue}". Open Sentry and filter by tag queue:${queue}.`,
          );
        }
      } catch {
        // Accounting is best-effort by design.
      }
    },
  };
}

/** Attach to a BullMQ Worker. Sits next to instrumentWorker / attachWorkerErrorReporting. */
export function attachJobFailureTracking(
  worker: { on: Function },
  queueName: string,
  tracker: FailureTracker,
): void {
  worker.on("failed", () => tracker.record(queueName));
}
