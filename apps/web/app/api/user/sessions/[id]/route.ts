import { NextRequest, NextResponse } from "next/server";
import { auth }        from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { db, sessions } from "@ai-platform/db";
import { eq, and }       from "drizzle-orm";

/**
 * Revoke one specific device/session. Takes the row's internal `id`
 * (never the session `token` — that never leaves the server for anything
 * but the caller's own current session). See sessions/route.ts for why
 * this doesn't go through better-auth's revokeSession client method.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqHeaders = await nextHeaders();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (id === session.session.id) {
    // Revoking your own current session here would just cut off the
    // request that's asking for it, with no signOut()/redirect to follow
    // it up — a confusing dead end. The Settings page's own "sign out"
    // control is the right place to end the current session.
    return NextResponse.json(
      { error: "CANNOT_REVOKE_CURRENT_SESSION" },
      { status: 400 }
    );
  }

  const deleted = await db.delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, session.user.id)))
    .returning({ id: sessions.id });

  if (deleted.length === 0) {
    // Either it never existed, already expired/was revoked, or (this is
    // the important case) belongs to a different user — reported the
    // same way either way so this can't be used to probe for other
    // users' session ids.
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
