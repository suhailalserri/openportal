import { rejectUnusableAccount } from "@/lib/account-guard-server";
import { NextRequest, NextResponse } from "next/server";
import { auth }            from "@/lib/auth";
import { headers }         from "next/headers";
import { db, fraudEvents } from "@ai-platform/db";
import { eq }              from "drizzle-orm";

interface Params { params: Promise<{ id: string }> }

export async function POST(_: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as unknown as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const lockedAccount = await rejectUnusableAccount(session.user.id);
  if (lockedAccount) return lockedAccount;

  const { id } = await params;
  await db.update(fraudEvents)
    .set({ resolved: true, resolvedBy: session.user.id, resolvedAt: new Date() })
    .where(eq(fraudEvents.id, id));

  return NextResponse.json({ success: true });
}
