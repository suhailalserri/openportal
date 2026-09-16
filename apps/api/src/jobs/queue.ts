import { Queue, Worker, type Job } from "bullmq";
import { config } from "../config";

const _queueRedisUrl = new URL(config.REDIS_URL);
const connection = {
  host: _queueRedisUrl.hostname,
  port: parseInt(_queueRedisUrl.port || "6379"),
  ...(_queueRedisUrl.password ? { password: _queueRedisUrl.password } : {}),
  // Fail a *connection attempt* in 10s instead of the OS-level TCP timeout
  // (which can be 60s+ on some hosts) when the host is wrong or unreachable.
  // Does not affect BullMQ's own command-retry behavior once connected.
  connectTimeout: 10_000,
};

// Without an error listener, an unreachable/misconfigured Redis (wrong
// REDIS_URL, DNS failure) throws unhandled "ECONNREFUSED"/"ENOTFOUND"
// errors on each of these four queues' underlying ioredis clients, which
// otherwise surface only as silent retries with no log line explaining why
// scheduled jobs, emails, or alerts stopped working.
function logRedisErrors(queue: Queue, name: string) {
  queue.on("error", (err) =>
    console.error(`[queue:${name}] Redis connection error:`, err.message)
  );
}

// ── Queues ─────────────────────────────────────────────────────────────
export const emailQueue   = new Queue("email",   { connection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } } });
export const alertQueue   = new Queue("alerts",  { connection, defaultJobOptions: { attempts: 3 } });
export const messageQueue = new Queue("messages",{ connection, defaultJobOptions: { attempts: 2 } });
export const reportQueue  = new Queue("reports", { connection, defaultJobOptions: { attempts: 2 } });

logRedisErrors(emailQueue, "email");
logRedisErrors(alertQueue, "alerts");
logRedisErrors(messageQueue, "messages");
logRedisErrors(reportQueue, "reports");

// ── Helper to add jobs ─────────────────────────────────────────────────
export async function queueEmail(type: string, data: Record<string, unknown>) {
  return emailQueue.add(type, data);
}

export async function queueAlert(message: string, level: "info" | "warning" | "critical" = "info") {
  return alertQueue.add("telegram", { message, level, timestamp: new Date().toISOString() });
}

export async function queueSaveMessage(data: Record<string, unknown>) {
  return messageQueue.add("save", data, { delay: 500 });
}
