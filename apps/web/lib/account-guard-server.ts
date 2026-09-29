import { NextResponse } from "next/server";
import { db, users }    from "@ai-platform/db";
import { eq }           from "drizzle-orm";
import {
  assertUsableAccount, ACCOUNT_REST_ERROR, ACCOUNT_ERROR_CODE,
} from "@ai-platform/api/utils/account-guard";

/**
 * P1.1 follow-up (owner-approved frozen-zone change): the account guard for
 * the Next.js route handlers under `app/api/**`.
 *
 * Those handlers authenticate with `auth.api.getSession` and, until now,
 * never looked at `users.status` / `users.isFraudFlagged`, so a suspended or
 * fraud-flagged user with a session could still use them. This is the same
 * shared decision function (`assertUsableAccount`) that `authMiddleware` and
 * the tRPC procedures use (decision L14), fed by a fresh read of the user row.
 *
 * Usage, immediately after the existing session check:
 *
 *   const lockedAccount = await rejectUnusableAccount(session.user.id);
 *   if (lockedAccount) return lockedAccount;
 *
 * Returns null when the account may proceed, otherwise a ready 403 response
 * whose `error` string matches the API's REST body and whose `code` is the
 * same stable code the tRPC errors carry. Fails CLOSED: a missing user row is
 * 401, and a DB error propagates (the route 500s) rather than letting the
 * request through.
 */
export async function rejectUnusableAccount(userId: string): Promise<NextResponse | null> {
  const user = await db.query.users.findFirst({
    where:   eq(users.id, userId),
    columns: { status: true, isFraudFlagged: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const guard = assertUsableAccount(user);
  if (guard.ok) return null;

  return NextResponse.json(
    { error: ACCOUNT_REST_ERROR[guard.reason], code: ACCOUNT_ERROR_CODE[guard.reason] },
    { status: 403 },
  );
}
