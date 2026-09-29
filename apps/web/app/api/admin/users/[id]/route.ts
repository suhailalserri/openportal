import { rejectUnusableAccount } from "@/lib/account-guard-server";
import { applyUserStatusChange } from "@ai-platform/api/services/user-status";
import { NextRequest, NextResponse } from "next/server";
import { auth }          from "@/lib/auth";
import { headers }       from "next/headers";
import { db, users, balances, transactions } from "@ai-platform/db";
import { eq, and, desc } from "drizzle-orm";
import { z }             from "zod";

interface Params { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["admin","superadmin"].includes((session.user as unknown as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const lockedAccount = await rejectUnusableAccount(session.user.id);
  if (lockedAccount) return lockedAccount;

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
  if (!session || !["admin","superadmin"].includes((session.user as unknown as {role:string}).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const lockedAccount = await rejectUnusableAccount(session.user.id);
  if (lockedAccount) return lockedAccount;

  const { id }  = await params;
  const body    = await req.json().catch(() => null) as unknown;
  const schema  = z.object({ status: z.enum(["active","suspended"]).optional() });
  const parsed  = schema.safeParse(body);
  if (!parsed.success || !z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: "Invalid" }, { status: 400 });

  // Nothing to change: same no-op success the route always returned.
  if (parsed.data.status === undefined) return NextResponse.json({ success: true });

  // P1.1 follow-up (owner-approved frozen-zone edit): this route used to write
  // users.status directly - no session revocation, no self-suspend guard, no
  // superadmin protection (G2b through a second door). It now delegates to the
  // same service the tRPC mutation uses, so both doors enforce the same rules.
  // IP: P1.3 will replace this with the shared getClientIp().
  const result = await applyUserStatusChange({
    actorId:  session.user.id,
    targetId: id,
    status:   parsed.data.status,
    ip:       req.headers.get("x-forwarded-for"),
  });
  if (!result.ok) {
    const status = result.code === "USER_NOT_FOUND" ? 404 : 403;
    return NextResponse.json({ error: result.code }, { status });
  }
  return NextResponse.json({ success: true });
}
