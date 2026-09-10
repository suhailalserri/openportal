import type { FastifyRequest, FastifyReply } from "fastify";
import { FRAUD }        from "@ai-platform/config";
import { checkLimit }   from "../utils/rate-limiter";

// Re-exported for any existing importers — prefer importing directly from
// ../utils/rate-limiter in new code (see that file for why this split exists).
export { checkLimit };

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
