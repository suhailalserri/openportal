import { NextResponse }    from "next/server";
import { auth }            from "@/lib/auth";
import { headers }         from "next/headers";
import { db, transactions } from "@ai-platform/db";
import { eq, desc }        from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await db.query.transactions.findMany({
    where:   eq(transactions.type, "usage_debit"),
    orderBy: [desc(transactions.createdAt)],
    limit:   200,
  });
  return NextResponse.json({ items });
}
