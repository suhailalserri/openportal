import type { FastifyRequest, FastifyReply } from "fastify";
import { FRAUD } from "@ai-platform/config";

// Simple in-memory rate limiter (replace with Redis in production)
const counters = new Map<string, { count: number; resetAt: number }>();

export function checkLimit(key: string, max: number, windowMs: number): boolean {
  const now    = Date.now();
  const entry  = counters.get(key);

  if (!entry || now > entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count++;
  if (entry.count > max) return false;
  return true;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of counters) {
    if (now > entry.resetAt) counters.delete(key);
  }
}, 5 * 60 * 1000);

export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply:   FastifyReply
): Promise<void> {
  const ip      = request.headers["cf-connecting-ip"] as string
               ?? request.headers["x-forwarded-for"] as string
               ?? request.ip
               ?? "unknown";

  const userId  = request.user?.id;
  const key     = userId ? `user:${userId}` : `ip:${ip}`;
  const allowed = checkLimit(key, FRAUD.MAX_REQUESTS_PER_MINUTE, 60_000);

  if (!allowed) {
    reply.status(429).header("Retry-After", "60").send({
      error:   "RATE_LIMIT_EXCEEDED",
      message: "تجاوزت الحد المسموح. انتظر دقيقة وحاول مجدداً.",
    });
  }
}
