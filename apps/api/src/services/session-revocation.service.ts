import { db, sessions } from "@ai-platform/db";
import { eq } from "drizzle-orm";

/**
 * Delete every better-auth session row for a user (plan P1.1, items 4-5).
 *
 * Accepts an optional transaction/handle so `updateUserStatus` can revoke in
 * the SAME transaction as the status flip: either both happen or neither.
 *
 * What this does NOT do: it cannot invalidate better-auth's 5-minute
 * `cookieCache` (apps/web/lib/auth.ts, frozen). The api-side guard reads the
 * user row on every request, so it is not affected; the frozen web route
 * handlers that call `auth.api.getSession` directly can still honour a cached
 * cookie for up to 5 minutes. Logged in docs/PR_NOTES.md.
 *
 * Returns the number of sessions removed.
 */
type Deleter = Pick<typeof db, "delete">;

export async function revokeUserSessions(
  userId: string,
  handle: Deleter = db,
): Promise<number> {
  const removed = await handle
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return removed.length;
}
