import Redis from "ioredis";
import { closeRedisClient } from "../lifecycle/redis-close";
import crypto from "node:crypto";
import {
  billingLockRejectedTotal,
  billingLockUnavailableTotal,
  billingLockLostTotal,
} from "../metrics";

/**
 * P1.2 — per-user in-flight lock for BILLED operations (closes G5).
 *
 * Problem: `checkAffordability` and the post-stream deduction are not one
 * atomic step. Two concurrent requests from the same user can both pass the
 * affordability check before either deduction commits; the second reply is
 * then generated for free. This lock guarantees a user has at most ONE billed
 * operation in flight, so the next operation always sees the balance left by
 * the previous deduction.
 *
 * Keyed on "billed operation", not "chat": transcription and agents reuse
 * `withBilledOperationLock` unchanged.
 *
 * Semantics
 *  - acquire : SET lock:billed:{userId} {requestId} NX PX {ttl}
 *  - heartbeat: every `heartbeatMs`, compare-and-PEXPIRE (Lua) so a long
 *               stream can't lose its lock, while a crashed/redeployed
 *               instance frees the user after one TTL (30 s), not after the
 *               2-minute stream ceiling.
 *  - release : compare-and-DEL (Lua) in `finally`, so an expired lock that
 *               someone else now holds is never deleted by us.
 *  - busy    : BillingLockBusyError  -> route answers 409, before any provider call
 *  - Redis down: BillingLockUnavailableError -> route answers 503 (FAIL CLOSED).
 *               Unlike rate limiting / idempotency, which fail open, this
 *               guards money: running without the lock re-opens G5.
 *  - lock lost mid-operation (heartbeat sees a different owner or none): logged,
 *               counted, `ctx.isLost()` becomes true, the operation is NOT
 *               aborted. Billing stays atomic (`WHERE credits >= X`), so the
 *               worst case is the pre-P1.2 race for that one request.
 *
 * Like chat-idempotency.service.ts this reads process.env.REDIS_URL directly
 * rather than the Zod-validated ./config, so it stays importable from tests
 * and other contexts that don't set every api env var.
 */

export const BILLING_LOCK_TTL_MS       = 30_000;
export const BILLING_LOCK_HEARTBEAT_MS = 10_000;

const lockKey = (userId: string) => `lock:billed:${userId}`;

/** Compare-and-PEXPIRE: extend only if we still own the lock. */
const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`;

/** Compare-and-DEL: release only if we still own the lock. */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/** The subset of ioredis this module uses (also what tests pass in). */
export interface BillingLockRedis {
  set(key: string, value: string, px: "PX", ms: number, nx: "NX"): Promise<"OK" | null>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export class BillingLockBusyError extends Error {
  constructor() {
    super("A billed operation is already in progress for this user");
    this.name = "BillingLockBusyError";
  }
}

export class BillingLockUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(`Billing lock store unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "BillingLockUnavailableError";
  }
}

export interface BilledLockContext {
  /** Same id the lock was stored under; pass it on as the gateway request id. */
  requestId: string;
  /** True once the heartbeat found the lock gone or owned by someone else. */
  isLost(): boolean;
}

export interface BilledLockOptions {
  requestId?:   string;
  ttlMs?:       number;
  heartbeatMs?: number;
  /** Test seam only. Real callers get the shared lazy client. */
  redis?:       BillingLockRedis;
}

// ── Shared lazy client ───────────────────────────────────────────────
// Created on first use (not at import) so importing this module has no side
// effects. Own client + short command timeout: a hung Redis must turn into a
// fast 503, not a request that hangs until the platform's own timeout.
let sharedRedis: Redis | null = null;
function getSharedRedis(): BillingLockRedis {
  if (!sharedRedis) {
    sharedRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect:          true,
      maxRetriesPerRequest: 1,
      commandTimeout:       3_000,
      connectTimeout:       5_000,
    });
    sharedRedis.on("error", (err) => {
      console.error("[billing-lock] redis connection error:", err.message);
    });
  }
  return sharedRedis as unknown as BillingLockRedis;
}

/**
 * Runs `fn` while holding the user's billed-operation lock.
 *
 * Throws BillingLockBusyError / BillingLockUnavailableError BEFORE `fn` runs.
 * Any error thrown by `fn` propagates unchanged after the lock is released.
 */
export async function withBilledOperationLock<T>(
  userId: string,
  fn: (ctx: BilledLockContext) => Promise<T>,
  opts: BilledLockOptions = {},
): Promise<T> {
  const redis       = opts.redis ?? getSharedRedis();
  const ttlMs       = opts.ttlMs ?? BILLING_LOCK_TTL_MS;
  const heartbeatMs = opts.heartbeatMs ?? BILLING_LOCK_HEARTBEAT_MS;
  const requestId   = opts.requestId ?? crypto.randomUUID();
  const key         = lockKey(userId);

  // ── Acquire ────────────────────────────────────────────────────────
  let acquired: "OK" | null;
  try {
    acquired = await redis.set(key, requestId, "PX", ttlMs, "NX");
  } catch (err) {
    billingLockUnavailableTotal.inc();
    throw new BillingLockUnavailableError(err);
  }
  if (acquired !== "OK") {
    billingLockRejectedTotal.inc();
    throw new BillingLockBusyError();
  }

  // ── Heartbeat ──────────────────────────────────────────────────────
  let lost     = false;
  let released = false;

  const beat = async (): Promise<void> => {
    if (lost || released) return;
    try {
      const extended = await redis.eval(EXTEND_SCRIPT, 1, key, requestId, ttlMs);
      if (Number(extended) !== 1 && !released && !lost) {
        lost = true;
        clearInterval(timer);
        billingLockLostTotal.inc();
        console.error(
          `[billing-lock] lock lost mid-operation for user ${userId} (request ${requestId}); ` +
          "continuing, billing remains atomic",
        );
      }
    } catch (err) {
      // A blip: keep the operation running and try again on the next tick.
      // If Redis stays down past the TTL the next tick will see "not owner".
      console.error("[billing-lock] heartbeat failed:", (err as Error).message);
    }
  };

  const timer = setInterval(() => { void beat(); }, heartbeatMs);
  timer.unref?.();

  try {
    return await fn({ requestId, isLost: () => lost });
  } finally {
    released = true;
    clearInterval(timer);
    try {
      await redis.eval(RELEASE_SCRIPT, 1, key, requestId);
    } catch (err) {
      // Not fatal: the key expires within one TTL and nobody else can be
      // affected except this same user's next request, for <= 30 s.
      console.error("[billing-lock] release failed, key will expire by TTL:", (err as Error).message);
    }
  }
}

// ── Route helper ─────────────────────────────────────────────────────

/** Structural subset of FastifyReply, so tests don't need Fastify. */
export interface LockErrorReply {
  header(name: string, value: string): unknown;
  status(code: number): { send(body: unknown): unknown };
}

export const REQUEST_IN_PROGRESS_BODY = {
  error:             "REQUEST_IN_PROGRESS",
  message:           "لديك طلب قيد المعالجة. انتظر لحظة ثم حاول مجدداً.",
  retryable:         true,
  retryAfterSeconds: 2,
} as const;

export const LOCK_UNAVAILABLE_BODY = {
  error:             "SERVICE_TEMPORARILY_UNAVAILABLE",
  message:           "الخدمة غير متاحة مؤقتاً. حاول بعد قليل.",
  retryable:         true,
  retryAfterSeconds: 5,
} as const;

const ALERT_THROTTLE_MS = 5 * 60_000;
let lastUnavailableAlertAt = 0;

/** Test hook: resets the alert throttle. */
export function _resetLockAlertThrottle(): void { lastUnavailableAlertAt = 0; }

async function defaultAlert(message: string): Promise<unknown> {
  // Dynamic import: jobs/queue.ts pulls in the Zod-validated config and
  // opens BullMQ connections; keep that out of this module's import graph.
  const { queueAlert } = await import("../jobs/queue");
  return queueAlert(message, "critical");
}

/**
 * Turns a lock error into the HTTP reply. Returns true if it handled the
 * error (reply sent), false if `err` is unrelated and the caller must
 * rethrow. Best-effort, throttled alert on the fail-closed path; the alert
 * queue is itself on Redis, so it is raced against a timeout and never
 * allowed to delay or fail the response.
 */
export function replyForLockError(
  err: unknown,
  reply: LockErrorReply,
  opts: { alert?: (message: string) => Promise<unknown> } = {},
): boolean {
  if (err instanceof BillingLockBusyError) {
    reply.header("Retry-After", String(REQUEST_IN_PROGRESS_BODY.retryAfterSeconds));
    reply.status(409).send(REQUEST_IN_PROGRESS_BODY);
    return true;
  }

  if (err instanceof BillingLockUnavailableError) {
    reply.header("Retry-After", String(LOCK_UNAVAILABLE_BODY.retryAfterSeconds));
    reply.status(503).send(LOCK_UNAVAILABLE_BODY);

    const now = Date.now();
    if (now - lastUnavailableAlertAt >= ALERT_THROTTLE_MS) {
      lastUnavailableAlertAt = now;
      const alert = opts.alert ?? defaultAlert;
      void Promise.race([
        alert("🚨 Billing lock unavailable (Redis): paid requests are being rejected with 503 (fail closed)."),
        new Promise((_, reject) => setTimeout(() => reject(new Error("alert timed out")), 3_000).unref?.()),
      ]).catch((e) => console.error("[billing-lock] alert failed:", (e as Error).message));
    }
    return true;
  }

  return false;
}

/** P3.2: graceful shutdown. Never throws; a no-op if the lock client was never created. */
export async function closeBillingLockRedis(): Promise<void> {
  if (!sharedRedis) return;
  const client = sharedRedis;
  sharedRedis = null;
  await closeRedisClient(client);
}
