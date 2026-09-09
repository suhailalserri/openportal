import { NextRequest, NextResponse } from "next/server";
import { auth }          from "@/lib/auth";
import { headers }       from "next/headers";
import { db, fraudEvents } from "@ai-platform/db";
import { eq, desc }      from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const resolved = req.nextUrl.searchParams.get("resolved") === "true";
  const items    = await db.query.fraudEvents.findMany({
    where:   eq(fraudEvents.resolved, resolved),
    orderBy: [desc(fraudEvents.createdAt)],
    limit:   100,
  });
  return NextResponse.json({ items });
}
