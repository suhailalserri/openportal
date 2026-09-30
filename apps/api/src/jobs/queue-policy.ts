/**
 * apps/api/src/jobs/queue-policy.ts (plan P2.3)
 *
 * The ONE place that decides how long finished BullMQ jobs stay in Redis.
 * Without retention every completed/failed job lives forever, so Redis
 * memory grows until the provider's limit is hit; with `noeviction` (N1) a
 * full Redis then REJECTS writes, i.e. the billing lock (P1.2) and queues
 * stop working. Retention keeps memory bounded.
 *
 * Pure: no config/env read, no Redis client, so vitest loads it without env.
 */

/** 24 h / 1000 jobs of history for successes, 7 days for failures (debugging window). */
export const COMPLETE_MAX_AGE_SECONDS = 86_400;
export const COMPLETE_MAX_COUNT = 1_000;
export const FAIL_MAX_AGE_SECONDS = 604_800;

export interface RetentionOverrides {
  completeAgeSeconds?: number;
  completeCount?: number;
  failAgeSeconds?: number;
}

/** Spread into a queue's `defaultJobOptions`. Overrides exist for tests only. */
export function jobRetention(o: RetentionOverrides = {}) {
  return {
    removeOnComplete: {
      age: o.completeAgeSeconds ?? COMPLETE_MAX_AGE_SECONDS,
      count: o.completeCount ?? COMPLETE_MAX_COUNT,
    },
    removeOnFail: { age: o.failAgeSeconds ?? FAIL_MAX_AGE_SECONDS },
  };
}
