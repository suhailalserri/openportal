/**
 * apps/api/src/monitoring/worker-errors.ts (plan P2.1)
 *
 * BullMQ `failed` events -> Sentry. Attached in index.ts next to
 * `instrumentWorker` (metrics). Reports EVERY failed attempt, tagged with the
 * attempt number, rather than guessing "is this the final attempt" from
 * BullMQ internals; Sentry groups repeats into one issue.
 *
 * Never reads `job.data` (email addresses, alert text): only the queue name,
 * job name and attempt counter are used.
 */
import { reportError } from "./error-hook";

interface WorkerLike {
  on: (event: "failed", handler: (job: JobLike | undefined, err: Error) => void) => unknown;
}
interface JobLike {
  name?: string;
  attemptsMade?: number;
}

export function attachWorkerErrorReporting(worker: { on: Function }, queueName: string): void {
  (worker as WorkerLike).on("failed", (job, err) => {
    reportError(err, {
      tags: {
        source: "worker",
        queue: queueName,
        job: job?.name ?? "unknown",
        attempt: String(job?.attemptsMade ?? 0),
      },
    });
  });
}
