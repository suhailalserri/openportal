import type { FastifyRequest, FastifyReply } from "fastify";
import { FRAUD }        from "@ai-platform/config";
import { checkLimit }   from "../utils/rate-limiter";
import { fraudService } from "../services/fraud.service";

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
    return;
  }

  // Redis-backed check — this is the piece that was previously never
  // called outside tests. checkLimit above is a fast, per-process,
  // in-memory first pass (still useful even if Redis is briefly down);
  // this catches the patterns checkLimit structurally can't: velocity
  // *and* multi-IP-per-user / multi-user-per-IP, and it's correct across
  // multiple api container replicas since the counters live in Redis, not
  // this process. Fails OPEN on error — a fraud-service outage must never
  // block chat traffic.
  if (userId) {
    try {
      const fraudCheck = await fraudService.checkRequestVelocity(userId, ip);
      if (!fraudCheck.allowed) {
        reply.status(429).header("Retry-After", "60").send({
          error:   "RATE_LIMIT_EXCEEDED",
          message: "تجاوزت الحد المسموح. انتظر دقيقة وحاول مجدداً.",
        });
        return;
      }
    } catch (err) {
      console.error("[rateLimit] fraud check failed, allowing request:", err);
    }
  }
}
