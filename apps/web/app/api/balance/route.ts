import { NextResponse } from "next/server";
import { auth }         from "@/lib/auth";
import { headers }      from "next/headers";
import { db, balances } from "@ai-platform/db";
import { eq }           from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await db.query.balances.findFirst({ where: eq(balances.userId, session.user.id) });
  return NextResponse.json({ credits: row?.credits ?? 0 });
}
