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
import { registerScheduledJobs } from "./jobs/scheduled.jobs";
import { reportQueue } from "./jobs/queue";
import { metricsHandler, recordHttpRequest, instrumentWorker } from "./metrics";
import { parseRedisConnection } from "./utils/redis-connection";

const app = Fastify({
  logger: config.NODE_ENV === "development"
    ? { level: "info", transport: { target: "pino-pretty" } }
    : { level: "warn" },
});

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
    },
  },
});

// ── Health check ───────────────────────────────────────────────────────
app.get("/health", async () => ({
  status:    "ok",
  timestamp: new Date().toISOString(),
  version:   process.env.npm_package_version ?? "1.0.0",
}));

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

  const { getBalance }    = await import("./services/balance.service");
  const { streamChat }    = await import("./services/gateway.service");
  const body              = req.body as {
    model: string; messages: Array<{ role: string; content: string }>;
    conversationId?: string;
  };

  const balance = await getBalance(req.user.id);
  if (balance.credits <= 0) {
    reply.status(402).send({
      error:      "INSUFFICIENT_BALANCE",
      message:    "رصيدك صفر. يرجى شحن حسابك.",
      redirectTo: "/billing",
    });
    return;
  }

  await streamChat({
    userId:         req.user.id,
    model:          body.model,
    messages:       body.messages,
    conversationId: body.conversationId ?? crypto.randomUUID(),
    reply,
  });
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
      instrumentWorker(startEmailWorker(redisConn), "email");
      instrumentWorker(startAlertWorker(redisConn), "alerts");
      instrumentWorker(startReportWorker(redisConn), "reports");
      await withTimeout(registerScheduledJobs(reportQueue), 15_000, "registerScheduledJobs");
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
