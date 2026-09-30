import { Worker, type Job } from "bullmq";
import { sendTelegram } from "../monitoring/telegram";

interface AlertJob {
  message:   string;
  level:     "info" | "warning" | "critical";
  timestamp: string;
}

export function startAlertWorker(connection: { host: string; port: number; password?: string }) {
  return new Worker("alerts", async (job: Job<AlertJob>) => {
    if (job.name !== "telegram") return;

    // P2.2: shared plain-text sender (redacted, bounded). A failed send now
    // THROWS so BullMQ retries (attempts: 3) and Sentry sees it; before, the
    // error was swallowed and a bad message was lost silently. Missing
    // TELEGRAM_* env stays a quiet no-op.
    const result = await sendTelegram(job.data.message, job.data.level);
    if (result.configured && !result.ok) {
      throw new Error(`Telegram send failed (status ${result.status ?? "network"})`);
    }
  }, { connection, concurrency: 2, drainDelay: 60, stalledInterval: 300_000 });
}
