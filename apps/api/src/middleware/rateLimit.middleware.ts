import type { FastifyRequest, FastifyReply } from "fastify";
import { FRAUD }        from "@ai-platform/config";
import { checkRateLimit } from "../utils/redis-rate-limiter";
import { fraudService } from "../services/fraud.service";
import { resolveApiClientIp, trustCfConnectingIpFromEnv } from "../utils/client-ip";

const WINDOW_MS = 60_000;

/**
 * P3.1: ONE Redis-backed check per /chat request (shared across replicas).
 *
 * - Fixed window whose expiry is set on the first hit only, so a steadily
 *   active user gets a clean window every 60 s (the old fraud-service counter
 *   re-armed its TTL on every request and never reset).
 * - Retry-After is the real time left in the window.
 * - Redis down -> per-process fallback (see utils/redis-rate-limiter.ts);
 *   paid chat is never blocked by a rate-limiter outage.
 * - Identity tracking (multi-IP / shared-IP signals) still runs for signed-in
 *   users after an allowed request; it never blocks and fails open.
 *
 * The per-process `checkLimit` is no longer called here. It remains exported
 * from ../utils/rate-limiter for the frozen apps/web routes.
 */
export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply:   FastifyReply
): Promise<void> {
  // P1.3: one shared resolver. X-Client-IP counts only on internal-token
  // requests (authMiddleware sets isInternalAuth); x-forwarded-for is never
  // read here, so a caller cannot mint a fresh identity by changing a header.
  const ip      = resolveApiClientIp({
    headers:             request.headers,
    requestIp:           request.ip,
    internalAuth:        request.isInternalAuth === true,
    trustCfConnectingIp: trustCfConnectingIpFromEnv(),
  });

  const userId = request.user?.id;
  const key    = userId ? `chat:user:${userId}` : `chat:ip:${ip}`;
  const result = await checkRateLimit(key, FRAUD.MAX_REQUESTS_PER_MINUTE, WINDOW_MS);

  if (!result.allowed) {
    // One audit row per window (the first denial), not one per rejected request.
    if (userId && result.count === FRAUD.MAX_REQUESTS_PER_MINUTE + 1) {
      try {
        await fraudService.recordRequestRateExceeded(userId, ip, result.count);
      } catch (err) {
        console.error("[rateLimit] failed to record rate-limit event:", err);
      }
    }
    reply.status(429).header("Retry-After", String(result.retryAfterSeconds)).send({
      error:             "RATE_LIMIT_EXCEEDED",
      message:           "تجاوزت الحد المسموح. انتظر قليلاً وحاول مجدداً.",
      retryAfterSeconds: result.retryAfterSeconds, // additive; body keeps the old error/message shape
    });
    return;
  }

  if (userId) {
    try {
      await fraudService.trackRequestIdentity(userId, ip);
    } catch (err) {
      console.error("[rateLimit] identity tracking failed, allowing request:", err);
    }
  }
}
