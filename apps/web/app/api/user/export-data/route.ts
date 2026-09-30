import { rejectUnusableAccount } from "@/lib/account-guard-server";
import { NextRequest, NextResponse } from "next/server";
import { auth }        from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";
import { checkLimit }  from "@ai-platform/api/utils/rate-limiter";
import { FRAUD }       from "@ai-platform/config";
import {
  db, users, balances, transactions, conversations,
} from "@ai-platform/db";
import { eq, desc } from "drizzle-orm";

/**
 * Settings → Danger zone → "Export Data". Returns a single JSON document
 * with everything the account itself owns: profile, current balance, full
 * transaction history, and conversation metadata (titles/models/timestamps
 * — not message bodies, which can be large; those already live in the
 * regular chat UI/export-per-conversation flow if one exists).
 *
 * GET (not a mutation) so the browser can trigger it as a normal
 * downloadable response; the Settings page fetches it and saves the blob
 * itself so it can show a loading state on the button.
 */
export async function GET(_req: NextRequest) {
  const reqHeaders = await nextHeaders();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lockedAccount = await rejectUnusableAccount(session.user.id);
  if (lockedAccount) return lockedAccount;

  if (!checkLimit(`export-data:${session.user.id}`, FRAUD.SENSITIVE_ACTION_PER_HOUR, 60 * 60_000)) {
    return NextResponse.json(
      { error: "TOO_MANY_ATTEMPTS", message: "محاولات كثيرة جداً. حاول مرة أخرى لاحقاً." },
      { status: 429 }
    );
  }

  const userId = session.user.id;

  const [profile, balance, txHistory, convos] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true, email: true, displayName: true, locale: true, tier: true,
        role: true, status: true, referralCode: true,
        createdAt: true, updatedAt: true, lastSeenAt: true,
        // Deliberately excluded: passwordHash, apiKeyHash, twoFactorSecret —
        // credentials/secrets don't belong in a data-export file a user
        // will download and potentially store or share elsewhere.
      },
    }),
    db.query.balances.findFirst({ where: eq(balances.userId, userId) }),
    db.select({
      id: transactions.id, type: transactions.type, amount: transactions.amount,
      balanceAfter: transactions.balanceAfter, description: transactions.description,
      modelId: transactions.modelId, inputTokens: transactions.inputTokens,
      outputTokens: transactions.outputTokens, createdAt: transactions.createdAt,
    })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt)),
    db.select({
      id: conversations.id, title: conversations.title, modelId: conversations.modelId,
      isPinned: conversations.isPinned, createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt, deletedAt: conversations.deletedAt,
    })
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.createdAt)),
  ]);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    profile,
    balance: balance ? {
      credits:       balance.credits,
      totalSpent:    balance.totalSpent,
      totalRedeemed: balance.totalRedeemed,
    } : null,
    transactions: txHistory,
    conversations: convos,
  };

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="account-data-${userId}.json"`,
    },
  });
}
