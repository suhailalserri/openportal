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

// ── Start background workers ───────────────────────────────────────────
// Parse all Redis URL components including DB number (path segment after /)
const _redisUrl  = new URL(config.REDIS_URL);
const redisConn = {
  host: _redisUrl.hostname,
  port: parseInt(_redisUrl.port || "6379"),
  // DB number from path: redis://host:port/1 → db=1, default 0
  db:   parseInt(_redisUrl.pathname.slice(1) || "0"),
  ...(_redisUrl.password ? { password: _redisUrl.password } : {}),
};

if (config.NODE_ENV === "production") {
  startEmailWorker(redisConn);
  startAlertWorker(redisConn);
  console.log("✓ Background workers started");
}

// ── Start server ───────────────────────────────────────────────────────
try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  console.log(`🚀 API running on :${config.PORT} [${config.NODE_ENV}]`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
