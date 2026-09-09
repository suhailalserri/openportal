import { Worker, type Job } from "bullmq";

interface AlertJob {
  message:   string;
  level:     "info" | "warning" | "critical";
  timestamp: string;
}

export function startAlertWorker(connection: { host: string; port: number; password?: string }) {
  return new Worker("alerts", async (job: Job<AlertJob>) => {
    if (job.name !== "telegram") return;

    const token  = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    const emoji = job.data.level === "critical" ? "🚨"
                : job.data.level === "warning"  ? "⚠️" : "ℹ️";

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chat_id:    chatId,
        text:       `${emoji} *AI Platform Alert*\n\n${job.data.message}\n\n_${job.data.timestamp}_`,
        parse_mode: "Markdown",
      }),
    }).catch(console.error);
  }, { connection, concurrency: 2 });
}
