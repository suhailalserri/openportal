import { NextResponse } from "next/server";
import { auth }         from "@/lib/auth";
import { headers }      from "next/headers";
import { db, users, balances } from "@ai-platform/db";
import { desc, eq }     from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({
      id: users.id, email: users.email, displayName: users.displayName,
      role: users.role, status: users.status, tier: users.tier,
      isFraudFlagged: users.isFraudFlagged, createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      credits: balances.credits,
    })
    .from(users)
    .leftJoin(balances, eq(users.id, balances.userId))
    .orderBy(desc(users.createdAt))
    .limit(200);

  return NextResponse.json({ items: rows });
}
