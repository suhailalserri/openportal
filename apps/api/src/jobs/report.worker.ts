import { Worker, type Job } from "bullmq";
import {
  runLowBalanceWarnings,
  runProviderBalanceCheck,
  runWeeklyReport,
  runModelLatencySync,
  runRedisHealthCheck,
  runPruneAuthRateLimit,
  runPriceGuardJob,
  runStorageSweep,
  runExtractAttachment,
} from "./scheduled.jobs";

// Consumes the "reports" queue — the queue registerScheduledJobs() (see
// scheduled.jobs.ts) adds repeating jobs to on startup. Without a worker
// listening on this queue, those repeat jobs would sit in Redis forever,
// scheduled but never executed: this was the actual missing piece, not
// the job definitions themselves.
export function startReportWorker(connection: { host: string; port: number; password?: string }) {
  return new Worker("reports", async (job: Job) => {
    switch (job.name) {
      case "lowBalanceWarnings":
        await runLowBalanceWarnings();
        break;
      case "providerBalanceCheck":
        await runProviderBalanceCheck();
        break;
      case "weeklyReport":
        await runWeeklyReport();
        break;
      case "modelLatencySync":
        await runModelLatencySync();
        break;
      case "redisHealth":
        await runRedisHealthCheck();
        break;
      case "pruneAuthRateLimit":
        await runPruneAuthRateLimit();
        break;
      case "priceGuard":
        await runPriceGuardJob();
        break;
      case "storageSweep":
        await runStorageSweep();
        break;
      case "extractAttachment":
        await runExtractAttachment(String((job.data as { attachmentId?: unknown })?.attachmentId ?? ""));
        break;
      default:
        console.warn(`Unknown report job: ${job.name}`);
    }
  }, { connection, concurrency: 2, drainDelay: 60, stalledInterval: 300_000 });
}
