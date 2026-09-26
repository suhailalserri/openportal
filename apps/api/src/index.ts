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
// B1: kept as a plain top-level import (not the lazy `await import(...)`
// pattern used for ./services/* below) — chat.schema.ts is pure validation
// logic with zero side effects at import time (no env read, no DB/Redis
// connection), unlike balance.service/gateway.service, which pull in
// "../config" and "@ai-platform/db" respectively. Nothing gated behind it.
import { chatRequestSchema, formatChatValidationError } from "./schemas/chat.schema";

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

  await streamChat({
    userId:          req.user.id,
    model:           body.model,
    messages:        body.messages,
    conversationId:  body.conversationId ?? crypto.randomUUID(),
    temperature:     body.temperature,
    top_p:           body.top_p,
    max_tokens:      body.max_tokens,
    systemPrompt:    body.systemPrompt,
    clientMessageId: body.clientMessageId,
    regenerate:      body.regenerate,
    abortSignal:     clientDisconnectController.signal,
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
