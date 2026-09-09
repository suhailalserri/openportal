import { NextResponse } from "next/server";
import { auth }        from "@/lib/auth";
import { headers }     from "next/headers";
import { db, users }   from "@ai-platform/db";
import { eq }          from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { hashSync }    from "bcryptjs";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawKey  = `sk-aip-${randomBytes(36).toString("hex")}`;
  const keyHash = hashSync(rawKey, 10);
  const prefix  = rawKey.slice(0, 14) + "...";

  await db.update(users)
    .set({ apiKeyHash: keyHash, apiKeyPrefix: prefix, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ key: rawKey, prefix });
}

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.update(users)
    .set({ apiKeyHash: null, apiKeyPrefix: null, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true });
}
