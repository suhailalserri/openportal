import Redis from "ioredis";

// Same cross-boundary reasoning as fraud.service.ts: this module is
// imported from apps/api's own request handlers, and reads process.env
// directly rather than the Zod-validated `./config` so it stays importable
// from contexts (tests, apps/web) that don't set every var `./config`
// requires at module load.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/** 24h — comfortably longer than any plausible client retry window, short
 *  enough that a permanently-reused clientMessageId (a client bug, not a
 *  legitimate retry) doesn't squat on the key forever. */
const CLAIM_TTL_SECONDS = 24 * 60 * 60;

export interface IdempotencyRedis {
  /** ioredis's `set(key, value, "EX", seconds, "NX")` returns "OK" on a
   *  successful claim, or `null` if the key already existed. */
  set(key: string, value: string, exFlag: "EX", seconds: number, nxFlag: "NX"): Promise<"OK" | null>;
}

/**
 * Attempts to atomically claim `clientMessageId` for `conversationId`.
 *
 * Returns `true` the FIRST time a given (conversationId, clientMessageId)
 * pair is seen — the caller should proceed with the user-row insert.
 * Returns `false` on every subsequent call with the same pair — the
 * caller must skip the insert (this is a retry, not a new turn).
 *
 * Fails OPEN (returns `true`, i.e. "go ahead and insert") on any Redis
 * error. This mirrors fraud.service.ts's fail-open posture: a Redis outage
 * must never block a paying user's message from being sent or saved. The
 * worst case on fail-open is the pre-B1 behavior returning (an occasional
 * duplicate row on a retry during an outage) — never a dropped message.
 */
export async function claimUserMessage(
  redis: IdempotencyRedis,
  conversationId: string,
  clientMessageId: string,
): Promise<boolean> {
  const key = `chat:idem:${conversationId}:${clientMessageId}`;
  try {
    const result = await redis.set(key, "1", "EX", CLAIM_TTL_SECONDS, "NX");
    return result === "OK";
  } catch (err) {
    console.error("[chat-idempotency] redis error, failing open:", (err as Error).message);
    return true;
  }
}

// ── Shared singleton ─────────────────────────────────────────────────
// lazyConnect defers the TCP connection until the first claimUserMessage
// call, matching fraud.service.ts's fraudRedis — importing this module has
// no side effect for any code path that never actually claims a message.
const idempotencyRedis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
idempotencyRedis.on("error", (err) => {
  // Logged for visibility; claimUserMessage() itself fails open on error —
  // see the doc comment above.
  console.error("[chat-idempotency] redis connection error:", err.message);
});

export const chatIdempotencyRedis = idempotencyRedis;
