import { NextResponse } from "next/server";
import { auth }                          from "@/lib/auth";
import { headers }                       from "next/headers";
import { db, conversations, messages }   from "@ai-platform/db";
import { eq, desc, isNull }              from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.query.conversations.findMany({
    where:   eq(conversations.userId, session.user.id),
    orderBy: [desc(conversations.updatedAt)],
    limit:   50,
    columns: { id: true, title: true, modelId: true, isPinned: true, updatedAt: true, deletedAt: true },
  });

  return NextResponse.json({
    items: items.filter(c => !c.deletedAt),
  });
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [conv] = await db.insert(conversations)
    .values({ userId: session.user.id })
    .returning();

  return NextResponse.json(conv);
}
