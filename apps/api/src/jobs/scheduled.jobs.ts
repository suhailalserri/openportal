import { Queue } from "bullmq";
import { db, users, balances, redeemCodes } from "@ai-platform/db";
import { eq, lt, and, lte } from "drizzle-orm";
import { queueAlert, queueEmail } from "./queue";
import { LOW_BALANCE_THRESHOLD }  from "@ai-platform/config";
import { syncModelsFromGateway }  from "../services/model-sync.service";

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

  // ── Every 15 min: Model provider + latency sync ─────────────────────
  // Keeps the model picker's speed/provider badges fresh without relying
  // on an admin remembering to click "Sync now". Discovery of brand-new
  // models still only happens here too, but new models still land as
  // status="pending" — this never auto-publishes anything or changes
  // pricing, same guarantee as the admin-triggered sync.
  await queue.add("modelLatencySync", {}, {
    repeat: { pattern: "*/15 * * * *" },
    jobId:  "model-latency-sync",
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
  // NOT a real check — there is no provider API integration wired up yet
  // (OpenAI/Anthropic/etc. balance endpoints need per-provider admin
  // credentials that don't exist in config.ts today). This used to send
  // "all providers appear healthy" on a timer regardless of reality,
  // which is worse than not running at all — a fake status message is
  // exactly what this platform's own StatusBanner deliberately avoids
  // doing to users. Until real balance checks are implemented, this
  // logs locally instead of pushing a misleading claim to the admin's
  // Telegram every 4 hours. Wire up real provider API calls here (and
  // only then queueAlert on an actual low-balance condition) before
  // trusting this job for anything operational.
  console.log("[scheduled] providerBalanceCheck: no provider API integration configured — skipping.");
}

// ── Every 15 min: model provider + latency sync ────────────────────────
// Same sync the admin "Sync now" button triggers (see model-sync.service.ts
// and models.router.ts `sync`), run unattended. adminUserId is omitted —
// a scheduled run has no admin behind it, and updatedByAdminId is nullable
// for exactly this case.
//
// Debounced failure alerting: process-local, resets on restart. Good
// enough here — the alternative (a Redis-backed cooldown) is real
// complexity for a job that already re-tries every 15 minutes on its
// own; without this, a gateway outage lasting hours would otherwise
// re-page the same "gateway unreachable" warning every 15 minutes.
let lastSyncFailureAlertAt = 0;
const SYNC_FAILURE_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export async function runModelLatencySync() {
  try {
    const result = await syncModelsFromGateway();
    if (result.discovered.length > 0 || result.latencyUpdated > 0 || result.deactivated.length > 0) {
      console.log(
        `[scheduled] modelLatencySync: ${result.discovered.length} discovered, ` +
        `${result.latencyUpdated} latency/provider refreshed, ${result.deactivated.length} deactivated.`
      );
    }
    if (result.latencyError) {
      const now = Date.now();
      if (now - lastSyncFailureAlertAt > SYNC_FAILURE_ALERT_COOLDOWN_MS) {
        lastSyncFailureAlertAt = now;
        await queueAlert(
          `⚠️ Scheduled model sync couldn't refresh provider/latency: ${result.latencyError}`,
          "warning"
        );
      }
    }
  } catch (err) {
    const now = Date.now();
    if (now - lastSyncFailureAlertAt > SYNC_FAILURE_ALERT_COOLDOWN_MS) {
      lastSyncFailureAlertAt = now;
      // Discovery itself failed (gateway unreachable / GATEWAY_MASTER_KEY
      // invalid). Existing published models keep working — nothing stops
      // serving chat traffic — so this is a "warning", not a page-someone-
      // now "critical": it just means new models won't be discovered and
      // speed/provider badges will go stale until the gateway's reachable
      // again.
      await queueAlert(
        `⚠️ Scheduled model sync failed: ${err instanceof Error ? err.message : String(err)}`,
        "warning"
      );
    }
  }
}

export async function runWeeklyReport() {
  await queueAlert(
    `📊 Weekly Report\n\nGenerate full report from admin dashboard:\nhttps://monitor.yourdomain.com`,
    "info"
  );
}
