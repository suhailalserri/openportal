import { NextRequest, NextResponse } from "next/server";
import { createHmac }  from "node:crypto";
import { db, balances, transactions } from "@ai-platform/db";
import { eq, sql }     from "drizzle-orm";
import { CREDIT_PACKAGES } from "@ai-platform/config";

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get("moyasar-signature") ?? "";
  const secret    = process.env.MOYASAR_WEBHOOK_SECRET ?? "";
  const expected  = createHmac("sha256", secret).update(body).digest("hex");
  if (signature !== expected) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const event = JSON.parse(body) as { type: string; data: { id: string; metadata: { userId: string; packageId: string } } };

  if (event.type === "payment.paid") {
    const { id: paymentId, metadata } = event.data;
    const { userId, packageId } = metadata;

    // Idempotency check
    const existing = await db.query.transactions.findFirst({
      where: eq(transactions.paymentId, paymentId),
    });
    if (existing) return NextResponse.json({ received: true });

    const pkg = CREDIT_PACKAGES[packageId as keyof typeof CREDIT_PACKAGES];
    if (!pkg) return NextResponse.json({ error: "Unknown package" }, { status: 400 });

    await db.transaction(async (tx) => {
      const updated = await tx.update(balances)
        .set({ credits: sql`credits + ${pkg.microCredits}`, updatedAt: new Date() })
        .where(eq(balances.userId, userId))
        .returning({ credits: balances.credits });
      await tx.insert(transactions).values({
        userId, type: "payment", amount: pkg.microCredits,
        balanceAfter: updated[0]?.credits ?? 0,
        description: `دفع: ${pkg.label}`, paymentId,
      });
    });
  }

  return NextResponse.json({ received: true });
}
