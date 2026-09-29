import Fastify           from "fastify";
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
import { reportQueue, queueAlert } from "./jobs/queue";
import { metricsHandler, recordHttpRequest, instrumentWorker, jobFailuresTotal } from "./metrics";
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

// P2.1 (closes G3): error tracking comes up before anything else can throw.
// No SENTRY_DSN => a no-op. Never throws (L12: Sentry must not affect requests).
initSentry();
// Unhandled rejections: log + report + keep serving (see process-handlers.ts).
installProcessErrorHandlers();
// P2.2: provider-outage and credit-deduction detectors -> Telegram (queue, direct fallback).
installAlertSignals((message, level) => { void queueAlert(message, level).catch(() => {}); });

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

// ── Health check ───────────────────────────────────────────────────────
app.get("/health", async () => ({
  status:    "ok",
  timestamp: new Date().toISOString(),
  version:   process.env.npm_package_version ?? "1.0.0",
}));

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
});

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
      const registerWorker = (worker: { on: Function }, name: string) => {
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
