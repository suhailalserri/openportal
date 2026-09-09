import { NextRequest, NextResponse } from "next/server";
import { auth }       from "@/lib/auth";
import { headers }    from "next/headers";
import { redeemCode } from "@/lib/redeem";
import { z }          from "zod";

const schema = z.object({ code: z.string().min(1).max(32) });

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body   = await req.json() as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const result = await redeemCode(session.user.id, parsed.data.code);
  return NextResponse.json(result);
}
