/**
 * apps/api/src/jobs/redis-health.ts (plan P2.3, closes N1)
 *
 * Two checks that protect everything stored in Redis (BullMQ jobs, the P1.2
 * billing lock, rate-limit counters):
 *   1. maxmemory-policy MUST be `noeviction`. Any LRU/LFU/random policy can
 *      silently delete a queued job or a lock under memory pressure.
 *   2. Memory use >= 70% of maxmemory raises a warning BEFORE `noeviction`
 *      starts rejecting writes.
 *
 * Managed providers may block `CONFIG` or report `maxmemory:0`; both give an
 * "unknown" result (logged once), never an exception. The provider's own
 * dashboard alert is the backstop (see docs/runbooks/REDIS_POLICY.md).
 *
 * Fail open (L12): nothing here can throw into a request path.
 */

export interface RedisHealthClient {
  call: (command: string, ...args: string[]) => Promise<unknown>;
  info: (section?: string) => Promise<string>;
}

export type PolicyStatus = { status: "ok" | "bad" | "unknown"; policy?: string };
export type MemoryStatus = { status: "ok" | "high" | "unknown"; ratio?: number };

export const REQUIRED_POLICY = "noeviction";
export const MEMORY_WARN_RATIO = 0.7;

export async function checkEvictionPolicy(redis: RedisHealthClient): Promise<PolicyStatus> {
  try {
    const reply = await redis.call("CONFIG", "GET", "maxmemory-policy");
    // ioredis returns ["maxmemory-policy", "<value>"]
    const policy = Array.isArray(reply) ? String(reply[1] ?? "") : "";
    if (!policy) return { status: "unknown" };
    return { status: policy === REQUIRED_POLICY ? "ok" : "bad", policy };
  } catch {
    return { status: "unknown" };
  }
}

export function parseMemoryInfo(text: string): { used: number; max: number } {
  const num = (name: string) => {
    const m = new RegExp(`^${name}:(\\d+)`, "m").exec(text);
    return m ? Number(m[1]) : 0;
  };
  return { used: num("used_memory"), max: num("maxmemory") };
}

export async function checkMemory(
  redis: RedisHealthClient,
  warnRatio = MEMORY_WARN_RATIO,
): Promise<MemoryStatus> {
  try {
    const { used, max } = parseMemoryInfo(await redis.info("memory"));
    if (!max || !used) return { status: "unknown" };
    const ratio = used / max;
    return { status: ratio >= warnRatio ? "high" : "ok", ratio };
  } catch {
    return { status: "unknown" };
  }
}

export interface RedisHealthDeps {
  alert: (message: string, level: "warning" | "critical") => void;
  report: (error: Error, tags: Record<string, string>) => void;
  log?: (message: string) => void;
  now?: () => number;
  /** Re-alert interval per check while the problem persists. */
  policyRealertMs?: number;
  memoryRealertMs?: number;
}

export function createRedisHealthMonitor(deps: RedisHealthDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((m: string) => console.warn(m));
  const policyEvery = deps.policyRealertMs ?? 6 * 3_600_000;
  const memoryEvery = deps.memoryRealertMs ?? 3_600_000;
  const last: Record<string, number> = {};
  const warnedUnknown = new Set<string>();

  const due = (key: string, every: number) => {
    const t = now();
    if (last[key] !== undefined && t - last[key]! < every) return false;
    last[key] = t;
    return true;
  };

  return {
    async run(redis: RedisHealthClient): Promise<{ policy: PolicyStatus; memory: MemoryStatus }> {
      const policy = await checkEvictionPolicy(redis);
      const memory = await checkMemory(redis);
      try {
        if (policy.status === "bad" && due("policy", policyEvery)) {
          const msg =
            `Redis maxmemory-policy is "${policy.policy}", must be "${REQUIRED_POLICY}". ` +
            `Queued jobs, billing locks and rate-limit counters can be silently evicted. ` +
            `Fix it in the Redis provider console.`;
          deps.alert(msg, "critical");
          deps.report(new Error(msg), { source: "redis-health", check: "eviction-policy" });
        }
        if (memory.status === "high" && due("memory", memoryEvery)) {
          const pct = Math.round((memory.ratio ?? 0) * 100);
          const msg = `Redis memory at ${pct}% of maxmemory. With noeviction, writes fail at 100%: upgrade the plan or find the growth.`;
          deps.alert(msg, "warning");
          deps.report(new Error(msg), { source: "redis-health", check: "memory" });
        }
        if (policy.status === "unknown" && !warnedUnknown.has("policy")) {
          warnedUnknown.add("policy");
          log("[redis-health] cannot read maxmemory-policy (CONFIG blocked?). Verify it in the provider console.");
        }
        if (memory.status === "unknown" && !warnedUnknown.has("memory")) {
          warnedUnknown.add("memory");
          log("[redis-health] maxmemory unknown/0. Memory alert relies on the provider dashboard.");
        }
      } catch {
        // Health reporting is best-effort.
      }
      return { policy, memory };
    },
  };
}
