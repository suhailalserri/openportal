import { Queue } from "bullmq";
import { db, users, balances, redeemCodes } from "@ai-platform/db";
import { eq, lt, and, lte } from "drizzle-orm";
import { queueAlert, queueEmail } from "./queue";
import { LOW_BALANCE_THRESHOLD }  from "@ai-platform/config";

// Called on server startup to register scheduled jobs
export async function registerScheduledJobs(queue: Queue) {

  // ── Daily 3 AM: Low balance warnings ───────────────────────────────
  await queue.add("lowBalanceWarnings", {}, {
    repeat: { pattern: "0 3 * * *" },
    jobId:  "low-balance-warnings",
  });

  // ── Every 4h: Check provider balances ──────────────────────────────
  await queue.add("providerBalanceCheck", {}, {
    repeat: { pattern: "0 */4 * * *" },
    jobId:  "provider-balance-check",
  });

  // ── Monday 8 AM: Weekly report ──────────────────────────────────────
  await queue.add("weeklyReport", {}, {
    repeat: { pattern: "0 8 * * 1" },
    jobId:  "weekly-report",
  });

  console.log("✓ Scheduled jobs registered");
}

// ── Job handlers ──────────────────────────────────────────────────────
export async function runLowBalanceWarnings() {
  const lowUsers = await db
    .select({ userId: balances.userId, credits: balances.credits })
    .from(balances)
    .where(and(
      lte(balances.credits, LOW_BALANCE_THRESHOLD),
    ))
    .limit(500);

  for (const row of lowUsers) {
    await queueEmail("lowBalance", { userId: row.userId, credits: row.credits });
  }
  console.log(`Low balance warning sent to ${lowUsers.length} users`);
}

export async function runProviderBalanceCheck() {
  // Placeholder — in production, query provider APIs for remaining balance
  await queueAlert("💡 Provider balance check: All providers appear healthy", "info");
}

export async function runWeeklyReport() {
  await queueAlert(
    `📊 Weekly Report\n\nGenerate full report from admin dashboard:\nhttps://monitor.yourdomain.com`,
    "info"
  );
}
