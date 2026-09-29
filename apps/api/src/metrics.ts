/**
 * Prometheus metrics for the Node.js middleware API.
 *
 * prometheus.yml already scrapes `api:4000/metrics` (job "api-middleware")
 * — this module is what makes that endpoint exist and return something
 * real instead of a 404. Metric names match Phase 18.1 of the master plan
 * so existing/future Grafana dashboards and alert rules can reference them
 * directly without a rename pass later.
 *
 * Active-user tracking uses a Redis sorted set (score = last-seen unix ms)
 * rather than an in-process counter, because this process can be scaled
 * horizontally (Phase 25, Stage 3) and an in-memory counter would silently
 * under-count the moment there's more than one api container.
 */
import client from "prom-client";
import { signalUpstreamCall } from "./monitoring/alert-hook";
import Redis  from "ioredis";
import { closeRedisClient } from "./lifecycle/redis-close";

// Deliberately NOT importing `./config` here (the Zod-validated env
// object) even though it already has REDIS_URL. config.ts requires ~10
// unrelated env vars (GATEWAY_MASTER_KEY, RESEND_API_KEY, etc.) and throws
// at import time if ANY are missing. This module is now reachable from
// test files that only ever set up DATABASE_URL/CODE_SALT (they never
// needed the rest, because they never touched this module before), and
// from apps/web, which doesn't set the api-only ones either. Reading the
// one var this file actually needs, directly, keeps those import chains
// working without dragging in requirements this file has nothing to do
// with.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "aip_process_" });

// ── Redis client for active-user tracking ──────────────────────────────
// Separate connection from BullMQ's — metrics scraping should never be
// starved by (or starve) job-queue traffic on the same connection.
const metricsRedis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
metricsRedis.on("error", (err) => {
  // Never let a Redis hiccup crash the process over a metrics side-effect.
  console.error("[metrics] redis error:", err.message);
});

const ACTIVE_USERS_KEY    = "metrics:active_users";
const ACTIVE_WINDOW_MS    = 5 * 60 * 1000; // "5-min active count" per Phase 18.1

// ── Technical metrics ────────────────────────────────────────────────
export const httpRequestDuration = new client.Histogram({
  name:       "aip_http_request_duration_seconds",
  help:       "HTTP request duration in seconds",
  labelNames: ["route", "method", "status"] as const,
  buckets:    [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers:  [registry],
});

export const upstreamDuration = new client.Histogram({
  name:       "aip_upstream_duration_seconds",
  help:       "Duration of requests to the AI gateway/provider",
  labelNames: ["provider", "model"] as const,
  buckets:    [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers:  [registry],
});

// Split into requests+errors (both counters) rather than a single
// "error rate" gauge — Prometheus can derive a rate from two counters,
// but a gauge can't be recomputed after the fact if the windowing was wrong.
export const upstreamRequestsTotal = new client.Counter({
  name:       "aip_upstream_requests_total",
  help:       "Total requests sent to the AI gateway/provider",
  labelNames: ["provider", "model"] as const,
  registers:  [registry],
});

export const upstreamErrorsTotal = new client.Counter({
  name:       "aip_upstream_errors_total",
  help:       "Total failed requests to the AI gateway/provider",
  labelNames: ["provider", "model", "status"] as const,
  registers:  [registry],
});

export const streamingConnectionsActive = new client.Gauge({
  name:      "aip_streaming_connections_active",
  help:      "Number of chat streams currently open",
  registers: [registry],
});

export const balanceDeductionFailuresTotal = new client.Counter({
  name:      "aip_balance_deduction_failures_total",
  help:      "Count of deductCreditsAtomic calls that failed (insufficient balance races, DB errors)",
  registers: [registry],
});

export const billingLockRejectedTotal = new client.Counter({
  name:      "aip_billing_lock_rejected_total",
  help:      "Billed requests rejected with 409 because the user already had one in flight (P1.2)",
  registers: [registry],
});

export const billingLockUnavailableTotal = new client.Counter({
  name:      "aip_billing_lock_unavailable_total",
  help:      "Billed requests rejected with 503 because the lock store (Redis) was unreachable (P1.2, fail closed)",
  registers: [registry],
});

export const billingLockLostTotal = new client.Counter({
  name:      "aip_billing_lock_lost_total",
  help:      "Locks found lost/expired mid-operation by the heartbeat (P1.2). The stream still completes; billing stays atomic.",
  registers: [registry],
});

export const fraudEventsTotal = new client.Counter({
  name:       "aip_fraud_events_total",
  help:       "Fraud events logged, by type and severity",
  labelNames: ["type", "severity"] as const,
  registers:  [registry],
});

export const queueJobDuration = new client.Histogram({
  name:       "aip_queue_job_duration_seconds",
  help:       "BullMQ job processing duration in seconds",
  labelNames: ["queue", "job", "status"] as const,
  buckets:    [0.05, 0.1, 0.5, 1, 2.5, 5, 10, 30],
  registers:  [registry],
});

export const jobFailuresTotal = new client.Counter({
  name:       "aip_job_failures_total",
  help:       "BullMQ job attempts that failed, by queue (P2.3). Counts every attempt, not only final failures.",
  labelNames: ["queue"] as const,
  registers:  [registry],
});

// ── Business metrics ─────────────────────────────────────────────────
export const creditsSpentTotal = new client.Counter({
  name:       "aip_credits_spent_total",
  help:       "Credits (display units) deducted for usage, by model",
  labelNames: ["model"] as const,
  registers:  [registry],
});

export const creditsRedeemedTotal = new client.Counter({
  name:       "aip_credits_redeemed_total",
  help:       "Credits (display units) added to balances, by source",
  labelNames: ["type"] as const, // redeem | payment | admin_credit | referral_bonus
  registers:  [registry],
});

export const activeUsersGauge = new client.Gauge({
  name:      "aip_active_users_gauge",
  help:      "Users seen in the last 5 minutes",
  registers: [registry],
});

// ── Helpers used by services/middleware ─────────────────────────────────

/** Call after any authenticated request resolves a user. */
export async function touchActiveUser(userId: string): Promise<void> {
  try {
    await metricsRedis.zadd(ACTIVE_USERS_KEY, Date.now(), userId);
  } catch {
    // Best-effort — a missed touch just slightly undercounts, never fatal.
  }
}

/** Recomputed on every /metrics scrape so the gauge never goes stale between requests. */
async function refreshActiveUsersGauge(): Promise<void> {
  try {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    await metricsRedis.zremrangebyscore(ACTIVE_USERS_KEY, 0, cutoff);
    const count = await metricsRedis.zcard(ACTIVE_USERS_KEY);
    activeUsersGauge.set(count);
  } catch {
    // Leave the gauge at its last known value rather than zeroing it out
    // on a transient Redis failure — a dip to 0 would page someone for nothing.
  }
}

/** Micro-credits → display credits, matching Phase 9.1's 1,000,000 unit. */
function toDisplayCredits(microCredits: number): number {
  return microCredits / 1_000_000;
}

export function recordCreditsSpent(modelId: string, microCredits: number): void {
  creditsSpentTotal.labels(modelId).inc(toDisplayCredits(microCredits));
}

export function recordCreditsRedeemed(type: string, microCredits: number): void {
  creditsRedeemedTotal.labels(type).inc(toDisplayCredits(microCredits));
}

export function recordUpstreamCall(
  provider: string, model: string, durationSeconds: number, ok: boolean, status?: number
): void {
  upstreamRequestsTotal.labels(provider, model).inc();
  upstreamDuration.labels(provider, model).observe(durationSeconds);
  if (!ok) upstreamErrorsTotal.labels(provider, model, String(status ?? "network_error")).inc();
  signalUpstreamCall(provider, ok); // P2.2: provider-outage detector -> Telegram
}

export function recordFraudEvent(type: string, severity: string): void {
  fraudEventsTotal.labels(type, severity).inc();
}

/**
 * onResponse hook — deliberately typed structurally (not `FastifyRequest`/
 * `FastifyReply`) rather than importing from "fastify". This module is
 * reachable from apps/web too (web runs balance.service.ts in-process via
 * the @ai-platform/api/services/redeem export, which now imports this
 * file for recordCreditsRedeemed), and apps/web has no "fastify" dependency
 * — see utils/rate-limiter.ts's header comment for the same constraint
 * applied to Fastify-typed code living in a file the web build reaches.
 */
export function recordHttpRequest(
  req:   { method: string; url?: string | undefined; routeOptions?: { url?: string | undefined } | undefined },
  reply: { statusCode: number; elapsedTime?: number | undefined }
): void {
  // routeOptions.url is the *pattern* (e.g. "/chat"), not the raw path —
  // avoids a cardinality explosion from unique IDs in path segments.
  const route = req.routeOptions?.url ?? req.url ?? "unknown";
  const seconds = reply.elapsedTime ? reply.elapsedTime / 1000 : 0;
  httpRequestDuration.labels(route, req.method, String(reply.statusCode)).observe(seconds);
}

/**
 * Attach completion/failure listeners to a BullMQ Worker so job duration
 * shows up in aip_queue_job_duration_seconds without touching each job's
 * own processor code. `job.processedOn` is set by BullMQ the moment a
 * worker picks the job up, so this captures actual processing time, not
 * time spent waiting in the queue.
 */
export function instrumentWorker(worker: { on: Function }, queueName: string): void {
  worker.on("completed", (job: { name?: string; processedOn?: number | null }) => {
    const seconds = job.processedOn ? (Date.now() - job.processedOn) / 1000 : 0;
    queueJobDuration.labels(queueName, job.name ?? "unknown", "completed").observe(seconds);
  });
  worker.on("failed", (job: { name?: string; processedOn?: number | null } | undefined) => {
    const seconds = job?.processedOn ? (Date.now() - job.processedOn) / 1000 : 0;
    queueJobDuration.labels(queueName, job?.name ?? "unknown", "failed").observe(seconds);
  });
}

/** Route handler for GET /metrics (registered in apps/api/src/index.ts). */
export async function metricsHandler(
  _req: unknown,
  reply: { header: (name: string, value: string) => void; send: (body: unknown) => void }
): Promise<void> {
  await refreshActiveUsersGauge();
  reply.header("Content-Type", registry.contentType);
  reply.send(await registry.metrics());
}

/** P3.2: graceful shutdown. Never throws. */
export const closeMetricsRedis = (): Promise<void> => closeRedisClient(metricsRedis);
