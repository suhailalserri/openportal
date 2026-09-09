import { NextResponse }    from "next/server";
import { auth }            from "@/lib/auth";
import { headers }         from "next/headers";
import { db, users, transactions } from "@ai-platform/db";
import { count, sum, eq }  from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [totalUsers]   = await db.select({ count: count() }).from(users);
  const [totalRedeemed]= await db.select({ total: sum(transactions.amount) })
    .from(transactions).where(eq(transactions.type, "redeem"));
  const [totalSpent]   = await db.select({ total: sum(transactions.amount) })
    .from(transactions).where(eq(transactions.type, "usage_debit"));

  return NextResponse.json({
    totalUsers:    totalUsers?.count     ?? 0,
    totalRedeemed: Math.abs(Number(totalRedeemed?.total ?? 0)) / 1_000_000,
    totalSpent:    Math.abs(Number(totalSpent?.total   ?? 0)) / 1_000_000,
  });
}
