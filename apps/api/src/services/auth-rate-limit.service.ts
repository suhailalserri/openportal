/**
 * P3.5: housekeeping for better-auth's shared rate-limit counters
 * (`rate_limit` table, see packages/db/src/schema/rate-limit.ts).
 *
 * better-auth keeps one row per (client IP + auth path). The longest window in
 * use is 60 s, so a row untouched for a day is long expired and only costs
 * space. Without pruning, a caller rotating IPs would grow the table forever.
 */
import { db, rateLimits } from "@ai-platform/db";
import { lt } from "drizzle-orm";

export const AUTH_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Deletes counters last touched before `now - retention`. Returns rows deleted. */
export async function pruneAuthRateLimit(
  now: number = Date.now(),
  retentionMs: number = AUTH_RATE_LIMIT_RETENTION_MS,
): Promise<number> {
  const deleted = await db
    .delete(rateLimits)
    .where(lt(rateLimits.lastRequest, now - retentionMs))
    .returning({ id: rateLimits.id });
  return deleted.length;
}
