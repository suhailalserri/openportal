import { NextRequest, NextResponse } from "next/server";
import { auth }              from "@/lib/auth";
import { headers }           from "next/headers";
import { db, transactions }  from "@ai-platform/db";
import { eq, desc }          from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit  = parseInt(req.nextUrl.searchParams.get("limit")  ?? "20");
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0");

  const items = await db.query.transactions.findMany({
    where:   eq(transactions.userId, session.user.id),
    orderBy: [desc(transactions.createdAt)],
    limit:   Math.min(limit, 100),
    offset,
  });

  return NextResponse.json({ items, hasMore: items.length === limit });
}
