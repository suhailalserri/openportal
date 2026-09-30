/**
 * Registers a BullMQ repeatable job and removes stale copies of it.
 *
 * Why: BullMQ builds a repeatable job's Redis key from name + jobId + PATTERN. Changing only the
 * cron pattern in code therefore does NOT move the job: it adds a second schedule and the old one
 * keeps firing forever. Every run costs Redis commands, which matters on Upstash's free tier.
 * This removes any repeatable with the same name but a different pattern, then (re)adds the wanted
 * one. Adding the same name + jobId + pattern again is a no-op, so it is safe on every boot.
 *
 * Pure: no config/env/Redis import, so vitest loads it without env.
 */
import type { Queue } from "bullmq";

export async function upsertRepeatable(
  queue: Queue,
  name: string,
  pattern: string,
  jobId: string,
): Promise<{ removed: number }> {
  let removed = 0;
  const existing = await queue.getRepeatableJobs();
  for (const r of existing) {
    if (r.name === name && r.pattern !== pattern) {
      await queue.removeRepeatableByKey(r.key);
      removed++;
    }
  }
  await queue.add(name, {}, { repeat: { pattern }, jobId });
  return { removed };
}
