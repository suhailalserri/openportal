import { Queue } from "bullmq";
import { db, users, balances, redeemCodes } from "@ai-platform/db";
import { eq, lt, and, lte } from "drizzle-orm";
import { queueAlert, queueEmail, reportQueue as healthQueue } from "./queue";
import { LOW_BALANCE_THRESHOLD }  from "@ai-platform/config";
import { syncModelsFromGateway }  from "../services/model-sync.service";
import { createRedisHealthMonitor, type RedisHealthClient } from "./redis-health";
import { reportError } from "../monitoring/error-hook";
import { pruneAuthRateLimit } from "../services/auth-rate-limit.service";
import { runPriceGuard } from "../services/price-guard.service";
import { getStorageService } from "../services/storage.service";
import { upsertRepeatable } from "./repeat-jobs";

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

  // ── Every 30 min: Model provider + latency sync ─────────────────────
  // Keeps the model picker's speed/provider badges fresh without relying
  // on an admin remembering to click "Sync now". Discovery of brand-new
  // models still only happens here too, but new models still land as
  // status="pending" — this never auto-publishes anything or changes
  // pricing, same guarantee as the admin-triggered sync.
  // 30 min (was 15): every run costs Redis commands and the free Upstash plan is capped.
  // upsertRepeatable also removes the old 15-min schedule left in Redis by earlier deploys.
  await upsertRepeatable(queue, "modelLatencySync", "*/30 * * * *", "model-latency-sync");

  // P2.3: Redis eviction policy + memory check (see redis-health.ts).
  // 30 min (was 10). Also clears the old 10-min schedule.
  await upsertRepeatable(queue, "redisHealth", "*/30 * * * *", "redis-health");

  // P3.5: drop expired better-auth rate-limit counters (see auth-rate-limit.service.ts).
  await queue.add("pruneAuthRateLimit", {}, {
    repeat: { pattern: "30 3 * * *" },
    jobId:  "prune-auth-rate-limit",
  });

  // P3.6: provider-cost guard. Daily, after the 03:00/03:30 housekeeping.
  await queue.add("priceGuard", {}, {
    repeat: { pattern: "0 4 * * *" },
    jobId:  "price-guard",
  });

  // P5.1: storage sweep (orphans, deleted conversations/accounts). Only when storage is configured,
  // so an unconfigured deploy adds no Redis traffic (N11).
  if (getStorageService()) {
    // 30 min: deletion cascade latency is up to ~30 min (privacy policy says "about 30 minutes").
    await upsertRepeatable(queue, "storageSweep", "*/30 * * * *", "storage-sweep");
  }

  console.log("✓ Scheduled jobs registered");
}

// ── Job handlers ──────────────────────────────────────────────────────
const redisHealth = createRedisHealthMonitor({
  alert:  (message, level) => { void queueAlert(message, level).catch(() => {}); },
  report: (error, tags)    => reportError(error, { tags }),
});

/** P2.3. Uses the reports queue's own ioredis client; never throws. */
export async function runRedisHealthCheck() {
  try {
    // BullMQ types `queue.client` as its own minimal IRedisClient, but at runtime it
    // is the underlying ioredis instance, which has call() and info().
    const client = (await healthQueue.client) as unknown as RedisHealthClient;
    await redisHealth.run(client);
  } catch (err) {
    console.error("[redis-health] check failed:", err instanceof Error ? err.message : err);
  }
}

/** P3.5. Housekeeping only: a failure is reported but never retried in a hot loop. */
export async function runPruneAuthRateLimit() {
  try {
    const deleted = await pruneAuthRateLimit();
    if (deleted > 0) console.log(`[scheduled] pruneAuthRateLimit: removed ${deleted} expired counter(s).`);
  } catch (err) {
    reportError(err, { tags: { source: "scheduled", job: "pruneAuthRateLimit" } });
    console.error("[scheduled] pruneAuthRateLimit failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * P3.6. Compares every published+available model's price to its cost (upstream
 * price when the OpenRouter feed matches, else our own wholesale) and sends ONE
 * Telegram digest if anything is below cost, under the margin bar, unpriced or
 * drifting. Silent when clean. A failure is reported to Sentry, never thrown
 * into a retry loop (it is a daily check, tomorrow's run is the retry).
 */
export async function runPriceGuardJob() {
  try {
    const run = await runPriceGuard({ alert: (message, level) => queueAlert(message, level) });
    console.log(
      `[scheduled] priceGuard: checked ${run.evaluation.checked}, ${run.evaluation.findings.length} finding(s), ` +
      `${run.evaluation.unchecked.length} without upstream match` +
      (run.upstreamError ? `, upstream feed failed: ${run.upstreamError}` : "") + ".",
    );
  } catch (err) {
    reportError(err, { tags: { source: "scheduled", job: "priceGuard" } });
    console.error("[scheduled] priceGuard failed:", err instanceof Error ? err.message : err);
  }
}

/** P5.1. Housekeeping: a failure is reported, never retried in a hot loop (the next run is the retry). */
export async function runStorageSweep() {
  const svc = getStorageService();
  if (!svc) return;
  try {
    const r = await svc.sweep();
    if (r.claimed > 0 || r.failed > 0 || r.purged > 0) {
      console.log(`[scheduled] storageSweep: claimed ${r.claimed}, removed ${r.removed}, failed ${r.failed}, purged ${r.purged}.`);
    }
    if (r.failed > 0) {
      reportError(new Error(`storageSweep: ${r.failed} object(s) could not be removed; will retry`), { tags: { source: "scheduled", job: "storageSweep" } });
    }
  } catch (err) {
    reportError(err, { tags: { source: "scheduled", job: "storageSweep" } });
    console.error("[scheduled] storageSweep failed:", err instanceof Error ? err.message : err);
  }
}

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

// ── Every 30 min: model provider + latency sync ────────────────────────
// Same sync the admin "Sync now" button triggers (see model-sync.service.ts
// and models.router.ts `sync`), run unattended. adminUserId is omitted —
// a scheduled run has no admin behind it, and updatedByAdminId is nullable
// for exactly this case.
//
// Debounced failure alerting: process-local, resets on restart. Good
// enough here — the alternative (a Redis-backed cooldown) is real
// complexity for a job that already re-tries every 30 minutes on its
// own; without this, a gateway outage lasting hours would otherwise
// re-page the same "gateway unreachable" warning every 30 minutes.
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
