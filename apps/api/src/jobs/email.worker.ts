import { Worker, type Job } from "bullmq";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendLowBalanceEmail,
  sendPasswordResetEmail,
} from "../services/email.service";
import { db, users } from "@ai-platform/db";
import { eq }        from "drizzle-orm";

interface EmailJob {
  type:   string;
  userId?: string;
  email?: string;
  name?:  string;
  url?:   string;
  credits?: number;
}

export function startEmailWorker(connection: { host: string; port: number; password?: string }) {
  return new Worker("email", async (job: Job<EmailJob>) => {
    const { data } = job;

    // Resolve user email if only userId provided
    let email = data.email;
    let name  = data.name ?? "";
    if (!email && data.userId) {
      const user = await db.query.users.findFirst({ where: eq(users.id, data.userId) });
      if (!user) return;
      email = user.email;
      name  = user.displayName ?? "";
    }
    if (!email) return;

    switch (job.name) {
      case "sendVerification":
        await sendVerificationEmail(email, name, data.url ?? "");
        break;
      case "welcome":
        await sendWelcomeEmail(email, name);
        break;
      case "lowBalance":
        await sendLowBalanceEmail(email, data.credits ?? 0);
        break;
      case "passwordReset":
        await sendPasswordResetEmail(email, data.url ?? "");
        break;
      default:
        console.warn(`Unknown email job: ${job.name}`);
    }
  }, { connection, concurrency: 5 });
}
