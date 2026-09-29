import { rejectUnusableAccount } from "@/lib/account-guard-server";
import { NextRequest, NextResponse } from "next/server";
import { auth }        from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { db, sessions } from "@ai-platform/db";
import { eq, desc, ne, and } from "drizzle-orm";

/**
 * Settings → Security → Active sessions.
 *
 * Deliberately does NOT use better-auth's `authClient.listSessions()`.
 * That endpoint intentionally returns an empty `token` for every session
 * except the caller's current one (a security measure — see
 * better-auth/better-auth#6940), and `revokeSession` only accepts a
 * `token`. That combination makes per-device revoke impossible to build
 * on top of their client API: it would look like it works and silently
 * do nothing for every device but the current one.
 *
 * Instead this reads the `sessions` table directly (apps/web already has
 * full db access — see delete-account/export-data routes for the same
 * pattern) and returns each row's `id` — an internal identifier, never
 * the `token` — for the DELETE route below to revoke by.
 */
export async function GET(_req: NextRequest) {
  const reqHeaders = await nextHeaders();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lockedAccount = await rejectUnusableAccount(session.user.id);
  if (lockedAccount) return lockedAccount;

  const rows = await db.select({
    id:        sessions.id,
    ip:        sessions.ip,
    userAgent: sessions.userAgent,
    createdAt: sessions.createdAt,
    updatedAt: sessions.updatedAt,
    expiresAt: sessions.expiresAt,
  })
    .from(sessions)
    .where(eq(sessions.userId, session.user.id))
    .orderBy(desc(sessions.updatedAt));

  return NextResponse.json({
    sessions: rows.map(r => ({ ...r, current: r.id === session.session.id })),
  });
}

/**
 * "Log out other devices" — deletes every session row for this user except
 * the one making this request. Also reliable without needing a token,
 * for the same reason as GET above.
 */
export async function DELETE(_req: NextRequest) {
  const reqHeaders = await nextHeaders();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lockedAccount = await rejectUnusableAccount(session.user.id);
  if (lockedAccount) return lockedAccount;

  await db.delete(sessions)
    .where(and(eq(sessions.userId, session.user.id), ne(sessions.id, session.session.id)));

  return NextResponse.json({ success: true });
}
