import { NextRequest, NextResponse } from "next/server";
import { auth }           from "@/lib/auth";
import { headers }        from "next/headers";
import { db, balances, transactions } from "@ai-platform/db";
import { eq, sql }        from "drizzle-orm";
import { z }              from "zod";

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id }  = await params;
  const body    = await req.json() as unknown;
  const schema  = z.object({
    amount: z.number().int().min(1),
    type:   z.enum(["admin_credit","admin_debit"]),
    reason: z.string().min(1),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const micro = parsed.data.amount * 1_000_000;
  const delta = parsed.data.type === "admin_credit" ? micro : -micro;

  await db.transaction(async (tx) => {
    const updated = await tx.update(balances)
      .set({ credits: sql`credits + ${delta}`, updatedAt: new Date() })
      .where(eq(balances.userId, id))
      .returning({ credits: balances.credits });

    await tx.insert(transactions).values({
      userId: id, type: parsed.data.type, amount: delta,
      balanceAfter: updated[0]?.credits ?? 0,
      description:  parsed.data.reason,
      adminId:      session.user.id,
      adminNote:    parsed.data.reason,
    });
  });

  return NextResponse.json({ success: true });
}
