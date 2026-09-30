/**
 * apps/api/src/lifecycle/readiness.ts (plan P3.2)
 *
 * GET /ready: "can this instance serve paid traffic right now?"
 *   - DB reachable (SELECT 1) and Redis reachable (PING), each bounded by a short timeout.
 *   - 503 while draining (checked before the cache, so it flips instantly).
 *   - Result cached for `ttlMs` (5 s) and concurrent callers share one probe, so this
 *     public route cannot be used to hammer the database or Redis.
 *
 * /health stays a pure liveness check on purpose. Render's health check must NOT
 * point here: a Redis blip would make Render pull and restart a healthy instance,
 * which is worse than the blip. /ready is for the external uptime monitor.
 */
export interface ReadinessDeps {
  checkDb: () => Promise<unknown>;
  checkRedis: () => Promise<unknown>;
  isDraining: () => boolean;
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

export interface ReadinessResult {
  statusCode: 200 | 503;
  body: { status: "ready" | "not_ready" | "draining"; db?: "ok" | "down"; redis?: "ok" | "down" };
}

async function probe(fn: () => Promise<unknown>, timeoutMs: number): Promise<"ok" | "down"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("probe timed out")), timeoutMs);
    });
    await Promise.race([Promise.resolve().then(fn), timeout]);
    return "ok";
  } catch {
    return "down";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createReadiness(deps: ReadinessDeps): { check(): Promise<ReadinessResult> } {
  const ttlMs     = deps.ttlMs ?? 5_000;
  const timeoutMs = deps.timeoutMs ?? 2_000;
  const now       = deps.now ?? Date.now;

  let cached: { at: number; result: ReadinessResult } | null = null;
  let inflight: Promise<ReadinessResult> | null = null;

  const run = async (): Promise<ReadinessResult> => {
    const [db, redis] = await Promise.all([probe(deps.checkDb, timeoutMs), probe(deps.checkRedis, timeoutMs)]);
    const ok = db === "ok" && redis === "ok";
    return { statusCode: ok ? 200 : 503, body: { status: ok ? "ready" : "not_ready", db, redis } };
  };

  return {
    async check() {
      if (deps.isDraining()) return { statusCode: 503, body: { status: "draining" } };
      if (cached && now() - cached.at < ttlMs) return cached.result;
      if (!inflight) {
        inflight = run()
          .then((result) => { cached = { at: now(), result }; return result; })
          .finally(() => { inflight = null; });
      }
      return inflight;
    },
  };
}
