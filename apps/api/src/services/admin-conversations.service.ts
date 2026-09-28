import { db, conversations, messages, transactions } from "@ai-platform/db";
import { and, eq, desc, sql, inArray, type SQL } from "drizzle-orm";

/**
 * apps/api/src/services/admin-conversations.service.ts
 *
 * Read-only, admin-only access to a specific user's chat history — the
 * feature this powers: from a user's detail page, an admin opens one of
 * their conversations and reads every message alongside the exact
 * credit cost the gateway charged for it, to verify billing is correct
 * rather than take the transaction ledger's number on faith.
 *
 * NEVER exposes a mutation. Both functions below are pure reads; nothing
 * here can edit, delete, or send a message as the user. The router layer
 * (admin.router.ts) additionally writes an audit-log row every time
 * `getConversationMessages` is called — reading a user's private chat
 * content is exactly the kind of access that should leave a trail, even
 * though role-checking (adminProcedure) is what actually gates it.
 *
 * COST JOIN: `messages` has no cost column of its own — that lives on
 * `transactions` (type "usage_debit"), linked by the shared `requestId` /
 * `gatewayRequestId` the gateway stamps on both rows in the same request
 * (see gateway.service.ts's `requestId`). A message with no matching
 * transaction (a user message, or a partial/failed assistant reply that
 * never got billed) simply has `creditCost: null` — that gap is itself
 * useful signal for the "is billing correct" question this screen exists
 * to answer, so it's surfaced as null rather than papered over as 0.
 */

export interface ConversationSummary {
  id:            string;
  title:         string | null;
  modelId:       string | null;
  isPinned:      boolean;
  createdAt:     Date;
  updatedAt:     Date;
  deletedAt:     Date | null;
  messageCount:  number;
}

export interface ListUserConversationsResult {
  items:      ConversationSummary[];
  nextCursor: string | null;
}

/**
 * Keyset pagination on (updated_at, id) — same tiebreak convention as
 * admin-logs.service.ts's listUsageLogs, safe under concurrent inserts.
 * Deliberately includes soft-deleted conversations (deletedAt set): they
 * still hold real billed usage the admin may need to audit, same reason
 * the schema comment on `conversations.deletedAt` gives for keeping the
 * rows at all ("kept for billing records"). The UI marks them as deleted
 * rather than hiding them.
 */
export async function listUserConversations(opts: {
  userId: string;
  limit: number;
  cursor?: string | undefined;
}): Promise<ListUserConversationsResult> {
  let cursorClause: SQL | undefined;
  if (opts.cursor) {
    const cursorRow = await db.query.conversations.findFirst({
      where:   eq(conversations.id, opts.cursor),
      columns: { id: true, updatedAt: true },
    });
    // Unknown/stale cursor: ignored, not an error — starts over from the
    // top rather than 500ing on a stale pagination link.
    if (cursorRow) {
      cursorClause = sql`(${conversations.updatedAt}, ${conversations.id}) < (${cursorRow.updatedAt.toISOString()}::timestamptz, ${cursorRow.id})`;
    }
  }

  const where = cursorClause
    ? and(eq(conversations.userId, opts.userId), cursorClause)
    : eq(conversations.userId, opts.userId);

  const rows = await db
    .select({
      id:        conversations.id,
      title:     conversations.title,
      modelId:   conversations.modelId,
      isPinned:  conversations.isPinned,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      deletedAt: conversations.deletedAt,
      messageCount: sql<number>`(
        select count(*)::int from ${messages}
        where ${messages.conversationId} = ${conversations.id}
      )`,
    })
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.updatedAt), desc(conversations.id))
    .limit(opts.limit);

  return {
    items: rows,
    nextCursor: rows.length === opts.limit ? rows[rows.length - 1]!.id : null,
  };
}

export interface ConversationMessageItem {
  id:          string;
  role:        string;
  content:     string;
  modelId:     string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  isPartial:   boolean;
  feedback:    string | null;
  createdAt:   Date;
  /** From the matching transaction (by requestId), null if none found —
   *  see the COST JOIN note above for why null is meaningful here. */
  creditCost:  number | null;
}

export interface GetConversationMessagesResult {
  conversation: ConversationSummary;
  messages:     ConversationMessageItem[];
}

/**
 * Full message history for one conversation, each assistant message
 * annotated with the credit amount actually debited for it (if any).
 * Returns null if the conversation doesn't belong to `userId` — callers
 * (the router) turn that into a 404, not a 403, so this never confirms
 * or denies that a conversation id exists under a DIFFERENT user (same
 * information-leak avoidance as a plain "not found" on a bad row id
 * elsewhere in this codebase).
 */
export async function getConversationMessages(opts: {
  userId: string;
  conversationId: string;
}): Promise<GetConversationMessagesResult | null> {
  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, opts.conversationId), eq(conversations.userId, opts.userId)),
  });
  if (!conversation) return null;

  const rows = await db.query.messages.findMany({
    where:   eq(messages.conversationId, opts.conversationId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  const requestIds = rows
    .map((m) => m.gatewayRequestId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const costByRequestId = new Map<string, number>();
  if (requestIds.length > 0) {
    const txns = await db
      .select({ requestId: transactions.requestId, amount: transactions.amount })
      .from(transactions)
      .where(and(eq(transactions.type, "usage_debit"), inArray(transactions.requestId, requestIds)));
    for (const t of txns) {
      if (t.requestId) costByRequestId.set(t.requestId, t.amount);
    }
  }

  return {
    conversation: {
      id:           conversation.id,
      title:        conversation.title,
      modelId:      conversation.modelId,
      isPinned:     conversation.isPinned,
      createdAt:    conversation.createdAt,
      updatedAt:    conversation.updatedAt,
      deletedAt:    conversation.deletedAt,
      messageCount: rows.length,
    },
    messages: rows.map((m) => ({
      id:            m.id,
      role:          m.role,
      content:       m.content,
      modelId:       m.modelId,
      inputTokens:   m.inputTokens,
      outputTokens:  m.outputTokens,
      isPartial:     m.isPartial,
      feedback:      m.feedback,
      createdAt:     m.createdAt,
      // amount on `transactions` is negative for a debit — surfaced here
      // as a positive "cost" since this screen is about what a message
      // cost, not the ledger's signed convention.
      creditCost: m.gatewayRequestId && costByRequestId.has(m.gatewayRequestId)
        ? Math.abs(costByRequestId.get(m.gatewayRequestId)!)
        : null,
    })),
  };
}
