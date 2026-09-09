import { NextRequest, NextResponse } from "next/server";
import { auth }             from "@/lib/auth";
import { headers }          from "next/headers";
import { db, redeemCodes }  from "@ai-platform/db";
import { generateCode }     from "@/lib/generate-code";
import { z }                from "zod";

const schema = z.object({
  count:       z.number().int().min(1).max(1000),
  creditValue: z.number().int().min(1),
  label:       z.string().min(1).max(100),
  expiresAt:   z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body   = await req.json() as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { count, creditValue, label, expiresAt } = parsed.data;
  const batchId = crypto.randomUUID();
  const codes   = Array.from({ length: count }, () => ({
    id:           crypto.randomUUID(),
    code:         generateCode(),
    creditAmount: creditValue * 1_000_000,
    faceValue:    `${creditValue} رصيد`,
    status:       "unused" as const,
    batchId,
    batchLabel:   label,
    createdByAdminId: session.user.id,
    expiresAt:    expiresAt ? new Date(expiresAt) : null,
  }));

  await db.insert(redeemCodes).values(codes);
  return NextResponse.json({ codes: codes.map(c => c.code), batchId, count });
}
