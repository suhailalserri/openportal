/**
 * Parses a Redis connection string into the plain options object BullMQ/
 * ioredis expect, with TLS enabled for `rediss://` URLs.
 *
 * Both apps/api/src/jobs/queue.ts and apps/api/src/index.ts previously
 * duplicated this parsing inline, and neither set `tls`. That's harmless
 * against a local/docker-compose Redis (`redis://`, no TLS), but against
 * any TLS-only managed Redis (`rediss://` — Upstash, Redis Cloud, AWS
 * ElastiCache with in-transit encryption, etc.) it makes ioredis open a
 * plain TCP socket to a port that only speaks TLS. The server resets the
 * connection immediately (ECONNRESET) — a hard failure, not a retryable
 * blip, so BullMQ retries forever and every queue looks permanently down.
 */
export function parseRedisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  const isTls = url.protocol === "rediss:";

  return {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    // DB number from path: redis://host:port/1 → db=1, default 0
    db:   parseInt(url.pathname.slice(1) || "0"),
    ...(url.password ? { password: url.password } : {}),
    // Empty object (not `true`) is intentional: it tells ioredis to use
    // Node's tls module with its default (secure) settings — verifying
    // the server certificate against trusted CAs — rather than a boolean
    // shorthand that some ioredis versions don't accept the same way.
    ...(isTls ? { tls: {} } : {}),
    // Fail a connection *attempt* in 10s instead of the OS-level TCP
    // timeout (60s+ on some hosts) when the host is wrong or unreachable.
    connectTimeout: 10_000,
  };
}
