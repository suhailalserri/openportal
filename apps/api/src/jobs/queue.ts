import { Queue, Worker, type Job } from "bullmq";
import { config } from "../config";

const connection = {
  host:     new URL(config.REDIS_URL).hostname,
  port:     parseInt(new URL(config.REDIS_URL).port || "6379"),
  password: new URL(config.REDIS_URL).password || undefined,
};

// ── Queues ─────────────────────────────────────────────────────────────
export const emailQueue   = new Queue("email",   { connection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } } });
export const alertQueue   = new Queue("alerts",  { connection, defaultJobOptions: { attempts: 3 } });
export const messageQueue = new Queue("messages",{ connection, defaultJobOptions: { attempts: 2 } });
export const reportQueue  = new Queue("reports", { connection, defaultJobOptions: { attempts: 2 } });

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
