/**
 * P3.5 (closes N6, N9): the api's HTTP security setup, extracted from index.ts
 * so it can be exercised with `app.inject()` in tests (index.ts listens on a
 * port at import time and cannot be imported by a test).
 *
 * What lives here:
 *  - security headers (helmet) with a strict CSP suited to a JSON-only API
 *  - CORS locked to the single web origin
 *  - request body limits (global default + a larger one for /chat)
 *  - logger redaction (defence in depth; see log-hygiene.test.ts for the scan)
 *  - the /metrics access guard (N9)
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";

// ── Body limits ────────────────────────────────────────────────────────
/** Default for every route (tRPC, webhooks, ...). Fastify's own default, made explicit. */
export const DEFAULT_BODY_LIMIT_BYTES = 1 * 1024 * 1024;
/**
 * /chat carries the whole conversation history on every turn. 4 MiB is about
 * 2M ASCII characters or 1M Arabic characters, comfortably above what fits in
 * any model's context here, and it stays under Vercel's 4.5 MB request limit
 * so the web proxy cannot be the first thing to reject a big-but-valid chat.
 * Body parsing happens before auth on this route, so do not raise it casually.
 */
export const CHAT_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

// ── Headers / CORS ─────────────────────────────────────────────────────
/**
 * This service returns JSON (and Prometheus text) only, never HTML, so nothing
 * may load or be framed: default-src 'none', no framing, no base tag, no forms.
 */
export const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src":     ["'none'"],
  "frame-ancestors": ["'none'"],
  "base-uri":        ["'none'"],
  "form-action":     ["'none'"],
};

/**
 * A browser's Origin header is scheme://host[:port] with no path and no
 * trailing slash. FRONTEND_URL is often pasted with a trailing slash, which
 * would then never match. Normalise to the bare origin.
 */
export function normalizeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

export async function registerSecurity(
  app: FastifyInstance,
  opts: { frontendUrl: string },
): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
  });
  await app.register(cors, {
    // One exact origin, never "*" and never a reflected Origin header.
    origin:      normalizeOrigin(opts.frontendUrl),
    credentials: true,
    methods:     ["GET", "HEAD", "POST", "OPTIONS"],
    maxAge:      600,
  });
}

// ── Logging ────────────────────────────────────────────────────────────
/**
 * Fastify's default request serializer already omits headers and body. This is
 * the second layer: if anyone ever logs a request/response object, credentials
 * and message content are censored instead of written to the log drain.
 */
export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  "req.body",
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.apiKey",
  "*.authorization",
  "*.messages",
  "*.content",
];

export const LOG_REDACT = { paths: LOG_REDACT_PATHS, censor: "[redacted]" } as const;

// ── /metrics guard (N9) ────────────────────────────────────────────────
const METRICS_TOKEN_MIN_LENGTH = 24;

/** Constant-time string compare (hash first so lengths never leak). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type MetricsAccess =
  | { mode: "token"; token: string }
  | { mode: "open" }
  | { mode: "disabled" };

/**
 * METRICS_TOKEN set (24+ chars)  -> Bearer token required.
 * unset / too short, production   -> endpoint disabled (404). Fail closed:
 *                                    the route sits on the public Render URL.
 * unset, development / test       -> open, so local Prometheus and tests work.
 */
export function resolveMetricsAccess(
  token: string | undefined,
  nodeEnv: string | undefined,
): MetricsAccess {
  const t = (token ?? "").trim();
  if (t.length >= METRICS_TOKEN_MIN_LENGTH) return { mode: "token", token: t };
  return nodeEnv === "production" ? { mode: "disabled" } : { mode: "open" };
}

export function metricsBootWarning(
  token: string | undefined,
  nodeEnv: string | undefined,
): string | undefined {
  if (nodeEnv !== "production") return undefined;
  const t = (token ?? "").trim();
  if (t.length >= METRICS_TOKEN_MIN_LENGTH) return undefined;
  return t.length > 0
    ? `⚠️ METRICS_TOKEN is set but shorter than ${METRICS_TOKEN_MIN_LENGTH} characters: /metrics is DISABLED.`
    : "ℹ️ METRICS_TOKEN is not set: /metrics is disabled (404). Set it, and send it as a Bearer token, to scrape.";
}

export function createMetricsGuard(access: MetricsAccess) {
  return async function metricsGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (access.mode === "open") return;
    if (access.mode === "disabled") {
      reply.status(404).send({ error: "Not found" });
      return;
    }
    const header = req.headers.authorization;
    if (typeof header !== "string" || !safeEqual(header, `Bearer ${access.token}`)) {
      reply.header("WWW-Authenticate", "Bearer");
      reply.status(401).send({ error: "Unauthorized" });
    }
  };
}
