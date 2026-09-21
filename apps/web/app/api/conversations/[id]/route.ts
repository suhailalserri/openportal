import { NextRequest, NextResponse } from "next/server";
import { auth }                          from "@/lib/auth";
import { headers }                       from "next/headers";
import { db, conversations, messages }   from "@ai-platform/db";
import { eq, and, asc }                  from "drizzle-orm";

interface Params { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const conv    = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, id), eq(conversations.userId, session.user.id)),
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const msgs = await db.query.messages.findMany({
    where:   eq(messages.conversationId, id),
    orderBy: [asc(messages.createdAt)],
  });

  return NextResponse.json({ ...conv, messages: msgs });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }  = await params;
  // B1/F3: systemPrompt added, purely additive — title/isPinned callers are
  // unaffected (still undefined-checked the same way below). The
  // `systemPrompt` column already existed on `conversations` before this
  // change (see packages/db/src/schema/conversations.ts); this is the
  // first code path that ever writes to it after conversation creation.
  const body    = await req.json() as { title?: string; isPinned?: boolean; systemPrompt?: string };

  const updateData: { updatedAt: Date; title?: string; isPinned?: boolean; systemPrompt?: string } = {
    updatedAt: new Date(),
  };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.isPinned !== undefined) updateData.isPinned = body.isPinned;
  // Empty string is a legitimate "clear the system prompt" request — only
  // `undefined` (the field omitted entirely) means "don't touch this
  // field," matching the same undefined-check pattern as title/isPinned
  // above.
  if (body.systemPrompt !== undefined) updateData.systemPrompt = body.systemPrompt;

  await db.update(conversations)
    .set(updateData)
    .where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id)));

  return NextResponse.json({ success: true });
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.update(conversations)
    .set({ deletedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id)));

  return NextResponse.json({ success: true });
}
