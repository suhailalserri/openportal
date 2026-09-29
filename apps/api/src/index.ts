import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors              from "@fastify/cors";
import helmet            from "@fastify/helmet";
import cookie            from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { config }        from "./config";
import { appRouter }     from "./routers/index";
import { createContext } from "./routers/trpc";
import { startEmailWorker } from "./jobs/email.worker";
import { startAlertWorker } from "./jobs/alert.worker";
import { startReportWorker } from "./jobs/report.worker";
import { registerScheduledJobs, runRedisHealthCheck } from "./jobs/scheduled.jobs";
import { createFailureTracker, attachJobFailureTracking } from "./jobs/job-failures";
import { reportQueue, emailQueue, alertQueue, messageQueue, queueAlert } from "./jobs/queue";
import { metricsHandler, recordHttpRequest, instrumentWorker, jobFailuresTotal, closeMetricsRedis } from "./metrics";
import { parseRedisConnection } from "./utils/redis-connection";
// B1: kept as a plain top-level import (not the lazy `await import(...)`
// pattern used for ./services/* below) — chat.schema.ts is pure validation
// logic with zero side effects at import time (no env read, no DB/Redis
// connection), unlike balance.service/gateway.service, which pull in
// "../config" and "@ai-platform/db" respectively. Nothing gated behind it.
import { chatRequestSchema, formatChatValidationError } from "./schemas/chat.schema";
import { trustedProxyHopsFromEnv, trustProxyByHops } from "./utils/client-ip";
import { initSentry, isSentryEnabled } from "./monitoring/sentry";
import { reportTrpcError } from "./monitoring/trpc-error";
import { registerFastifyErrorReporting } from "./monitoring/fastify-errors";
import { attachWorkerErrorReporting } from "./monitoring/worker-errors";
import { installProcessErrorHandlers } from "./monitoring/process-handlers";
import { isAuthorizedSmokeTest, smokeTestError } from "./monitoring/smoke-test";
import { installAlertSignals } from "./monitoring/alert-wiring";
import { createGatewayProbe } from "./monitoring/gateway-health";
import { isAuthorizedSentryWebhook, formatSentryAlert } from "./monitoring/sentry-webhook";
import { sendTelegram } from "./monitoring/telegram";
import { db, closeDb } from "@ai-platform/db";
import { sql } from "drizzle-orm";
import { flushSentry } from "./monitoring/sentry";
import {
  createShutdownController,
  installShutdownSignalHandlers,
  shutdownTimingFromEnv,
  SHUTTING_DOWN_BODY,
  type ShutdownCloser,
} from "./lifecycle/shutdown";
import { createReadiness } from "./lifecycle/readiness";

// P2.1 (closes G3): error tracking comes up before anything else can throw.
// No SENTRY_DSN => a no-op. Never throws (L12: Sentry must not affect requests).
initSentry();
// Unhandled rejections: log + report + keep serving (see process-handlers.ts).
installProcessErrorHandlers();
// P2.2: provider-outage and credit-deduction detectors -> Telegram (queue, direct fallback).
installAlertSignals((message, level) => { void queueAlert(message, level).catch(() => {}); });

// P3.2 (closes N2): graceful shutdown. Workers are created later (production only),
// so they register here and the closers list is built when SIGTERM arrives.
const workers: Array<{ close: () => Promise<unknown> }> = [];
const shutdown = createShutdownController({
  ...shutdownTimingFromEnv(),
  log: (level, message) => {
    if (level === "error") console.error(message);
    else if (level === "warn") console.warn(message);
    else console.log(message);
  },
  onAbort: (count) => {
    void queueAlert(`⚠️ Deploy: aborted ${count} stream(s) at the drain deadline; they were billed for content already streamed.`, "warning").catch(() => {});
  },
  closers: (): ShutdownCloser[] => [
    // 1. Stop the HTTP server (idle keep-alive connections are closed; nothing billed is in flight now).
    { name: "http", close: () => app.close() },
    // 2. Background work, then the queues' own Redis connections.
    ...workers.map((w, i) => ({ name: `worker:${i}`, close: () => w.close() })),
    { name: "queue:email",    close: () => emailQueue.close() },
    { name: "queue:alerts",   close: () => alertQueue.close() },
    { name: "queue:messages", close: () => messageQueue.close() },
    { name: "queue:reports",  close: () => reportQueue.close() },
    // 3. The other Redis clients.
    { name: "redis:billing-lock", close: async () => (await import("./services/billing-lock.service")).closeBillingLockRedis() },
    { name: "redis:idempotency",  close: async () => (await import("./services/chat-idempotency.service")).closeIdempotencyRedis() },
    { name: "redis:fraud",        close: async () => (await import("./services/fraud.service")).closeFraudRedis() },
    { name: "redis:rate-limit",   close: async () => (await import("./utils/redis-rate-limiter")).closeRateLimitRedis() },
    { name: "redis:metrics",      close: () => closeMetricsRedis() },
    // 4. Database (waits for already-sent queries, so the post-stream message save lands), then Sentry.
    { name: "db",     close: () => closeDb(5) },
    { name: "sentry", close: () => flushSentry(2_000) },
  ],
  exit: (code) => process.exit(code),
});
installShutdownSignalHandlers(shutdown);

const proxyHops = trustedProxyHopsFromEnv();

const app = Fastify({
  // P1.3: request.ip is the address appended by the nearest trusted proxy
  // (Render's edge), not the first X-Forwarded-For entry a caller can forge.
  // Hop count from TRUSTED_PROXY_HOPS (default 1; 0 turns trustProxy off).
  trustProxy: proxyHops > 0 ? trustProxyByHops(proxyHops) : false,
  logger: config.NODE_ENV === "development"
    ? { level: "info", transport: { target: "pino-pretty" } }
    : { level: "warn" },
});

// P2.1: catch-all for errors thrown outside tRPC (/chat handler + preHandler,
// /health, /metrics, smoke test). Must be added before the routes below.
registerFastifyErrorReporting(app);

// ── Plugins ────────────────────────────────────────────────────────────
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors,   { origin: config.FRONTEND_URL, credentials: true });
await app.register(cookie);

// ── tRPC ──────────────────────────────────────────────────────────────
await app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router:      appRouter,
    createContext,
    onError: ({ error, path }: { error: Error; path: string | undefined }) => {
      // Always log server-side — this only affects server logs, never the
      // client response (tRPC's own error formatter controls that). Previously
      // this was gated to non-production, which meant real errors in prod
      // (like the apiKeyHash mismatch below) were completely invisible.
      app.log.error({ path, err: error.message }, "tRPC error");
      // P2.1: server faults only (INTERNAL_SERVER_ERROR); expected codes are ignored.
      reportTrpcError({ error, path });
    },
  },
});

// While draining, tell keep-alive clients (Render's proxy) not to reuse this connection.
app.addHook("onSend", async (_req, reply) => {
  if (shutdown.isDraining()) reply.header("Connection", "close");
});

// ── Health check (liveness) ────────────────────────────────────────────
// Deliberately dependency-free and 200 even while draining: Render's health
// check points HERE, so a Redis/DB blip or a deploy drain never gets a healthy
// instance pulled and restarted. Readiness is /ready below.
app.get("/health", async () => ({
  status:    "ok",
  timestamp: new Date().toISOString(),
  version:   process.env.npm_package_version ?? "1.0.0",
}));

// ── Readiness (P3.2) ───────────────────────────────────────────────────
// DB (SELECT 1) + Redis (PING), short timeouts, cached 5 s. 503 while draining.
// For the external uptime monitor, NOT for Render's health check (see /health).
const readiness = createReadiness({
  checkDb:    () => db.execute(sql`select 1`),
  // BullMQ types `queue.client` as its own minimal IRedisClient (no ping); at runtime it is
  // the underlying ioredis instance (same cast as runRedisHealthCheck in scheduled.jobs.ts).
  checkRedis: async () => ((await reportQueue.client) as unknown as { ping(): Promise<unknown> }).ping(),
  isDraining: () => shutdown.isDraining(),
});
app.get("/ready", async (_req, reply) => {
  const { statusCode, body } = await readiness.check();
  reply.status(statusCode).send(body);
});

// ── Gateway synthetic check (P2.2) ─────────────────────────────────────
// For the external uptime monitor. The gateway is private (N8), so the monitor
// probes THIS route and the api probes the gateway. 200 = gateway answered
// (any status < 500), 503 = network error / timeout / 5xx. No detail leaked;
// result cached 30 s so this public route cannot be used to hammer the gateway.
const gatewayProbe = createGatewayProbe({ url: `${config.GATEWAY_URL.replace(/\/+$/, "")}/api/status` });
app.get("/health/gateway", async (_req, reply) => {
  const up = await gatewayProbe.isUp();
  reply.status(up ? 200 : 503).send({ status: up ? "ok" : "down" });
});

// ── Sentry -> Telegram relay (P2.2) ────────────────────────────────────
// Sentry alert rule -> Webhook action -> this URL. Off (404) unless
// SENTRY_WEBHOOK_TOKEN is set. Forwards only title/level/project/link.
app.post("/internal/sentry-alert", async (req, reply) => {
  const token = (req.query as { token?: unknown } | undefined)?.token;
  if (!config.SENTRY_WEBHOOK_TOKEN) {
    reply.status(404).send({ error: "Not found" });
    return;
  }
  if (!isAuthorizedSentryWebhook(token, config.SENTRY_WEBHOOK_TOKEN)) {
    reply.status(401).send({ error: "Unauthorized" });
    return;
  }
  const { message, level } = formatSentryAlert(req.body);
  const result = await sendTelegram(message, level);
  reply.status(result.ok || !result.configured ? 200 : 502).send({ delivered: result.ok });
});

// ── Sentry smoke test (P2.1) ───────────────────────────────────────────
// No staging environment exists, so "a deliberate error reaches Sentry within a
// minute" is drilled here. Requires INTERNAL_SERVICE_TOKEN => no public surface.
// The thrown error is reported by the Fastify onError hook, exactly like a real
// unhandled route error, so this exercises the real path end to end.
app.post("/internal/sentry-test", async (req, reply) => {
  if (!isAuthorizedSmokeTest(req.headers.authorization, config.INTERNAL_SERVICE_TOKEN)) {
    reply.status(401).send({ error: "Unauthorized" });
    return;
  }
  if (!isSentryEnabled()) {
    reply.status(409).send({
      error:   "SENTRY_DISABLED",
      message: "SENTRY_DSN is unset or invalid on this service; nothing would be sent.",
    });
    return;
  }
  throw smokeTestError();
});

// ── Metrics ────────────────────────────────────────────────────────────
// Matches prometheus.yml's "api-middleware" scrape job (api:4000/metrics).
// Not IP-restricted at the app level — internal Docker network already
// keeps this unreachable from the internet (see Phase 4.2 / security
// checklist: internal services never exposed publicly).
app.get("/metrics", metricsHandler);
app.addHook("onResponse", async (req, reply) => {
  // Skip the /metrics route itself — instrumenting the metrics endpoint's
  // own latency in the same histogram it serves is noise, not signal.
  if (req.routeOptions?.url === "/metrics") return;
  recordHttpRequest(req, reply);
});

// ── Chat streaming endpoint ────────────────────────────────────────────
app.post("/chat", {
  preHandler: async (req, reply) => {
    const { authMiddleware }    = await import("./middleware/auth.middleware");
    const { rateLimitMiddleware } = await import("./middleware/rateLimit.middleware");
    await authMiddleware(req, reply);
    if (reply.sent) return;
    await rateLimitMiddleware(req, reply);
  },
}, async (req, reply) => {
  if (!req.user) { reply.status(401).send({ error: "Unauthorized" }); return; }

  // P3.2: every billed /chat is one tracked operation. While draining, new ones
  // get a retryable 503 (the client retries and lands on the new instance).
  const op = shutdown.beginOperation();
  if (!op) {
    reply.header("Retry-After", String(SHUTTING_DOWN_BODY.retryAfterSeconds));
    reply.status(503).send(SHUTTING_DOWN_BODY);
    return;
  }
  try {
    await handleChat(req, reply, op.signal);
  } finally {
    op.end(); // after streamChat returned: deduction has been awaited, message save issued
  }
});

async function handleChat(
  req: FastifyRequest,
  reply: FastifyReply,
  shutdownSignal: AbortSignal,
): Promise<void> {
  if (!req.user) return;

  // B1/F2: validate the body with Zod instead of the bare `as` cast this
  // route used to do. Every field beyond the original
  // {model, messages, conversationId} trio is optional (see chat.schema.ts)
  // — this must not reject any request the old bare cast used to accept.
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.status(400).send(formatChatValidationError(parsed.error));
    return;
  }
  const body = parsed.data;

  const { getBalance }    = await import("./services/balance.service");
  const { streamChat }    = await import("./services/gateway.service");
  const { withBilledOperationLock, replyForLockError } =
    await import("./services/billing-lock.service");

  // Cheap, coarse fast-path: reject a fully zeroed-out balance before we
  // even resolve the model. This is NOT the real affordability guard —
  // it only catches "exactly empty", not "too small for this specific
  // request's actual cost". The real check (which knows the model's
  // price and clamps max_tokens to what's affordable) lives in
  // streamChat -> checkAffordability (gateway.service.ts). Do not remove
  // this thinking checkAffordability alone is redundant with it, and do
  // not treat this one as sufficient on its own — see that function's
  // doc comment for the bug that shipped when it was the only gate.
  const balance = await getBalance(req.user.id);
  if (balance.credits <= 0) {
    reply.status(402).send({
      error:      "INSUFFICIENT_BALANCE",
      message:    "رصيدك صفر. يرجى شحن حسابك.",
      redirectTo: "/billing",
    });
    return;
  }

  // B1/F5: bind the upstream fetch (inside streamChat) to this connection's
  // close event, so hitting Stop or closing the tab actually cancels the
  // in-flight provider request instead of letting it run for the full 2
  // minutes at our expense. `reply.raw` is the underlying Node
  // http.ServerResponse — "close" fires on a client-initiated disconnect
  // AND on a normal completed response, so the controller is aborted
  // unconditionally once the handler returns; that's harmless either way
  // (an already-finished fetch has nothing left to abort).
  const clientDisconnectController = new AbortController();
  reply.raw.on("close", () => clientDisconnectController.abort(
    new DOMException("Client disconnected", "AbortError"),
  ));
  // P3.2: at the shutdown drain deadline the same controller is aborted, which
  // makes streamChat take its existing partial-stream path (bill what was
  // streamed, save the message with isPartial) instead of being killed unbilled.
  shutdownSignal.addEventListener("abort", () => clientDisconnectController.abort(
    new DOMException("Server shutting down", "AbortError"),
  ), { once: true });

  // P1.2 (closes G5): one billed operation in flight per user. The lock sits
  // HERE, above streamChat, because streamChat makes provider-side calls
  // (history compaction) before its own affordability check, and because the
  // deduction happens after the stream ends — the lock must span all of it
  // (success, upstream error, client abort) and is released in a `finally`.
  //
  // Ordering matters: this runs after auth, rate limiting and the DB-only
  // zero-balance check, and BEFORE streamChat's idempotency claim, so a 409
  // never consumes a clientMessageId claim (the client's retry still inserts
  // its user row exactly once).
  //
  // Busy -> 409 REQUEST_IN_PROGRESS (retryable, Retry-After: 2).
  // Redis down -> 503 (fail CLOSED, unlike rate limiting: this guards money).
  try {
    await withBilledOperationLock(req.user.id, (lock) =>
      streamChat({
        userId:          req.user!.id,
        model:           body.model,
        messages:        body.messages,
        conversationId:  body.conversationId ?? crypto.randomUUID(),
        temperature:     body.temperature,
        top_p:           body.top_p,
        max_tokens:      body.max_tokens,
        clientMessageId: body.clientMessageId,
        regenerate:      body.regenerate,
        requestId:       lock.requestId,
        abortSignal:     clientDisconnectController.signal,
        reply,
      }),
    );
  } catch (err) {
    if (replyForLockError(err, reply)) return;
    // P2.1: rethrown on purpose — Fastify's onError hook (registered above via
    // registerFastifyErrorReporting) reports it to Sentry and returns the 500.
    throw err;
  }

  // P3.2: shutdown aborted this request before any response byte was written
  // (streamChat stays silent on an abort, since for a client disconnect nobody
  // is listening). Here the client IS listening: answer a retryable 503.
  if (shutdownSignal.aborted && !reply.sent && !reply.raw.headersSent) {
    reply.header("Retry-After", String(SHUTTING_DOWN_BODY.retryAfterSeconds));
    reply.status(503).send(SHUTTING_DOWN_BODY);
  }
}

// ── Start server ───────────────────────────────────────────────────────
// This MUST happen before background job/worker startup, and must never be
// blocked by it. Background jobs depend on Redis; the chat proxy, billing
// endpoints, and /health do not need Redis to be reachable. Previously,
// `await registerScheduledJobs(...)` ran before `app.listen()` — if Redis
// was unreachable (wrong REDIS_URL, DNS failure, network partition),
// ioredis's default reconnect behavior retries with backoff indefinitely
// and nothing ever throws, so the process would hang forever with the HTTP
// port never opening. Render (or any host) then sees "port never opened"
// and kills the process after its boot timeout, looking exactly like a
// crash with zero log output explaining why. A Redis outage today should
// degrade background jobs (email, alerts, reports) — it must never take
// the entire API, including paid chat traffic, down with it.
try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  console.log(`🚀 API running on :${config.PORT} [${config.NODE_ENV}]`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// ── Start background workers (non-blocking, timeout-guarded) ───────────
const redisConn = parseRedisConnection(config.REDIS_URL);

/** Rejects after `ms` if `promise` hasn't settled — prevents any single
 * startup step (e.g. a Redis-dependent queue.add call) from hanging the
 * whole background-init sequence forever when the dependency is down. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

if (config.NODE_ENV === "production") {
  // Fire-and-forget: intentionally not awaited at module scope. Any failure
  // here (Redis down, DNS issue) is logged loudly but never prevents the
  // server that's already listening from serving chat/billing traffic.
  void (async () => {
    try {
      // P2.1: every worker gets metrics AND Sentry `failed` reporting.
      // P2.3: + failed-job metric and burst alert.
      const failureTracker = createFailureTracker({
        count: (queue) => jobFailuresTotal.labels(queue).inc(),
        alert: (message) => { void queueAlert(message, "warning").catch(() => {}); },
      });
      const registerWorker = (worker: { on: Function; close: () => Promise<unknown> }, name: string) => {
        workers.push(worker); // P3.2: closed on SIGTERM
        instrumentWorker(worker, name);
        attachWorkerErrorReporting(worker, name);
        attachJobFailureTracking(worker, name, failureTracker);
      };
      registerWorker(startEmailWorker(redisConn), "email");
      registerWorker(startAlertWorker(redisConn), "alerts");
      registerWorker(startReportWorker(redisConn), "reports");
      await withTimeout(registerScheduledJobs(reportQueue), 15_000, "registerScheduledJobs");
      // P2.3: check the Redis eviction policy right away (then every 10 min via the reports queue).
      await withTimeout(runRedisHealthCheck(), 15_000, "runRedisHealthCheck");
      console.log("✓ Background workers started");
    } catch (err) {
      app.log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "⚠️ Background worker/queue startup failed — server is still up and serving " +
        "chat/billing traffic, but scheduled jobs (low-balance emails, weekly reports, " +
        "model sync) will not run until this is resolved. Check REDIS_URL."
      );
    }
  })();
}
