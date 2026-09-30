import Redis from "ioredis";
import { checkLimit } from "./rate-limiter";
import { rateLimitFallbackTotal } from "../metrics";
import { closeRedisClient } from "../lifecycle/redis-close";

/**
 * P3.1 — Redis-backed rate limiter (closes G9).
 *
 * Fixed window, shared by every api replica: one atomic Lua script does
 * INCR, sets the expiry ONLY when the key is new (so steady traffic can never
 * push the window forward — the bug the old `rate:{user}:rpm` counter had),
 * and returns the count plus the real time left in the window.
 *
 * Outage policy (deliberate deviation from the plan's "fail open"):
 *   Redis unreachable -> fall back to the per-process `checkLimit`. A paying
 *   user is never blocked by a Redis blip, yet each replica still enforces a
 *   cap. Counted in `aip_rate_limit_fallback_total`, alert throttled to one per
 *   5 minutes. After a failure Redis is skipped for FAILURE_BACKOFF_MS so a
 *   dead Redis adds no per-request latency. Money paths (billing lock,
 *   affordability) are NOT affected: they still fail closed.
 *
 * Limitation of any fixed window: a client can spend `max` at the end of one
 * window and `max` at the start of the next (up to 2x in a short burst).
 * Acceptable for abuse control; not a billing guarantee.
 *
 * Kept free of Fastify/Zod-config imports and lazy (no connection at import),
 * like billing-lock.service.ts: user.router.ts (re-exported into apps/web) and
 * the Vercel bundle import it.
 */

export const RATE_LIMIT_KEY_PREFIX = "rl:";
export const FAILURE_BACKOFF_MS    = 5_000;
const ALERT_THROTTLE_MS            = 5 * 60_000;

/** Atomic: INCR, expire only on first hit (or self-heal a key without TTL), return {count, ttlMs}. */
export const RATE_LIMIT_SCRIPT = `
local c = redis.call("incr", KEYS[1])
local ttl = redis.call("pttl", KEYS[1])
if c == 1 or ttl < 0 then
  redis.call("pexpire", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { c, ttl }`;

/** The subset of ioredis this module uses (also what tests pass in). */
export interface RateLimitRedis {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export interface RateLimitResult {
  allowed:           boolean;
  /** Hits in the current window including this one. null when running on the per-process fallback. */
  count:             number | null;
  limit:             number;
  /** Whole seconds until the window resets (>= 1). Use for Retry-After. */
  retryAfterSeconds: number;
  /** True when Redis was unavailable and the per-process fallback answered. */
  degraded:          boolean;
}

export interface RateLimitOptions {
  /** Test seam only. Real callers get the shared lazy client. */
  redis?:  RateLimitRedis;
  /** Test seam: alert sink. Defaults to the Telegram alert queue. */
  alert?:  (message: string) => Promise<unknown>;
  /** Test seam: clock. */
  now?:    () => number;
}

// ── Shared lazy client ───────────────────────────────────────────────
let sharedRedis: Redis | null = null;
function getSharedRedis(): RateLimitRedis {
  if (!sharedRedis) {
    sharedRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect:          true,
      maxRetriesPerRequest: 1,
      commandTimeout:       1_500, // a hung Redis must degrade quickly, not stall /chat
      connectTimeout:       3_000,
    });
    sharedRedis.on("error", (err) => {
      console.error("[rate-limit] redis connection error:", err.message);
    });
  }
  return sharedRedis as unknown as RateLimitRedis;
}

// ── Outage state (per process) ───────────────────────────────────────
let skipRedisUntil    = 0;
let lastAlertAt       = 0;

/** Test hook: resets backoff + alert throttle. */
export function _resetRateLimiterState(): void {
  skipRedisUntil = 0;
  lastAlertAt    = 0;
}

async function defaultAlert(message: string): Promise<unknown> {
  // Dynamic import: jobs/queue.ts pulls in the Zod-validated config and opens
  // BullMQ connections; keep that out of this module's import graph.
  const { queueAlert } = await import("../jobs/queue");
  return queueAlert(message, "warning");
}

function noteFailure(err: unknown, opts: RateLimitOptions, now: number): void {
  skipRedisUntil = now + FAILURE_BACKOFF_MS;
  rateLimitFallbackTotal.inc();
  console.error("[rate-limit] redis unavailable, using per-process fallback:", (err as Error).message);

  if (now - lastAlertAt >= ALERT_THROTTLE_MS) {
    lastAlertAt = now;
    const alert = opts.alert ?? defaultAlert;
    // Best-effort: the alert queue is itself on Redis, so race it against a timeout.
    void Promise.race([
      alert("⚠️ Rate limiter: Redis unavailable. Falling back to per-process limits (each replica counts alone). Paid chat is NOT blocked."),
      new Promise((_, reject) => setTimeout(() => reject(new Error("alert timed out")), 3_000).unref?.()),
    ]).catch((e) => console.error("[rate-limit] alert failed:", (e as Error).message));
  }
}

function fallback(key: string, max: number, windowMs: number): RateLimitResult {
  const allowed = checkLimit(`fb:${key}`, max, windowMs);
  return {
    allowed,
    count:             null,
    limit:             max,
    // The per-process window's exact remainder is not exposed; the full window is the safe upper bound.
    retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    degraded:          true,
  };
}

function parseReply(reply: unknown): { count: number; ttlMs: number } {
  if (!Array.isArray(reply) || reply.length < 2) throw new Error("unexpected rate-limit script reply");
  const count = Number(reply[0]);
  const ttlMs = Number(reply[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) throw new Error("non-numeric rate-limit script reply");
  return { count, ttlMs };
}

/**
 * Counts one hit against `key` and says whether it is within `max` per `windowMs`.
 * Never throws: on any Redis problem it answers from the per-process fallback.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
  opts: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const now = (opts.now ?? Date.now)();
  if (now < skipRedisUntil) return fallback(key, max, windowMs);

  try {
    const redis = opts.redis ?? getSharedRedis();
    const { count, ttlMs } = parseReply(
      await redis.eval(RATE_LIMIT_SCRIPT, 1, `${RATE_LIMIT_KEY_PREFIX}${key}`, windowMs),
    );
    return {
      allowed:           count <= max,
      count,
      limit:             max,
      retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      degraded:          false,
    };
  } catch (err) {
    noteFailure(err, opts, now);
    return fallback(key, max, windowMs);
  }
}

/** P3.2: graceful shutdown. Never throws; a no-op if the client was never created. */
export async function closeRateLimitRedis(): Promise<void> {
  if (!sharedRedis) return;
  const client = sharedRedis;
  sharedRedis = null;
  await closeRedisClient(client);
}
