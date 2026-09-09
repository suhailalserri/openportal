import { NextRequest, NextResponse } from "next/server";
import { auth }          from "@/lib/auth";
import { headers }       from "next/headers";
import { db, users, balances, transactions } from "@ai-platform/db";
import { eq, and, desc } from "drizzle-orm";
import { z }             from "zod";

interface Params { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const user   = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { passwordHash: false, apiKeyHash: false, twoFactorSecret: false },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const balance    = await db.query.balances.findFirst({ where: eq(balances.userId, id) });
  const recentTxns = await db.query.transactions.findMany({
    where: eq(transactions.userId, id), orderBy: [desc(transactions.createdAt)], limit: 20,
  });

  return NextResponse.json({ user, balance, recentTxns });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id }  = await params;
  const body    = await req.json() as { status?: string };
  const schema  = z.object({ status: z.enum(["active","suspended"]).optional() });
  const parsed  = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  await db.update(users).set({ ...parsed.data, updatedAt: new Date() }).where(eq(users.id, id));
  return NextResponse.json({ success: true });
}
