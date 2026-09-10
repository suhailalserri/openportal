import { db, balances, transactions } from "@ai-platform/db";
import { and, eq, gte, sql } from "drizzle-orm";
import type { DeductResult } from "@ai-platform/types";

/**
 * Any executor that can run queries: either the top-level `db` or a `tx`
 * handle from an in-progress `db.transaction()`. Letting callers pass their
 * own `tx` is what makes multi-step money operations (e.g. redeemCode's
 * "claim code" + "credit balance") atomic as ONE transaction instead of two
 * independent ones on separate pooled connections.
 */
type Executor = typeof db;

export interface UsageMetadata {
  modelId:      string;
  inputTokens:  number;
  outputTokens: number;
  requestId:    string;
}

export async function getBalance(userId: string) {
  const row = await db.query.balances.findFirst({
    where: eq(balances.userId, userId),
  });
  return row ?? { credits: 0, totalSpent: 0, totalRedeemed: 0 };
}

/**
 * Atomically deduct credits. Safe against race conditions.
 * Returns false if balance insufficient (never goes negative).
 */
export async function deductCreditsAtomic(
  userId:      string,
  microCredits: number,
  description: string,
  metadata:    Partial<UsageMetadata> & { requestId?: string } = {},
  executor:    Executor = db,
  txType:      "usage_debit" | "admin_debit" = "usage_debit"
): Promise<DeductResult> {
  if (microCredits <= 0) {
    throw new Error(`deductCreditsAtomic: microCredits must be positive, got ${microCredits}`);
  }

  return await executor.transaction(async (tx) => {
    const updated = await tx
      .update(balances)
      .set({
        credits:    sql`credits - ${microCredits}`,
        totalSpent: sql`total_spent + ${microCredits}`,
        updatedAt:  new Date(),
      })
      .where(
        and(
          eq(balances.userId, userId),
          gte(balances.credits, microCredits) // Only deduct if sufficient — cannot go negative
        )
      )
      .returning({ credits: balances.credits });

    if (updated.length === 0) {
      return { success: false, newBalance: 0, reason: "INSUFFICIENT_BALANCE" };
    }

    const newBalance = updated[0]!.credits;

    await tx.insert(transactions).values({
      userId,
      type:         txType,
      amount:       -microCredits,
      balanceAfter: newBalance,
      description,
      ...(metadata.requestId    !== undefined ? { requestId: metadata.requestId } : {}),
      ...(metadata.modelId      !== undefined ? { modelId: metadata.modelId } : {}),
      ...(metadata.inputTokens  !== undefined ? { inputTokens: metadata.inputTokens } : {}),
      ...(metadata.outputTokens !== undefined ? { outputTokens: metadata.outputTokens } : {}),
    });

    return { success: true, newBalance };
  });
}

/**
 * Credit a user's balance (redeem, admin grant, payment).
 */
export async function creditBalance(
  userId:      string,
  microCredits: number,
  type:        "redeem" | "admin_credit" | "payment" | "referral_bonus",
  metadata:    { description?: string; redeemCodeId?: string; adminId?: string; adminNote?: string; paymentId?: string },
  executor:    Executor = db
): Promise<void> {
  await executor.transaction(async (tx) => {
    const updated = await tx
      .update(balances)
      .set({
        credits:       sql`credits + ${microCredits}`,
        totalRedeemed: sql`total_redeemed + ${microCredits}`,
        updatedAt:     new Date(),
      })
      .where(eq(balances.userId, userId))
      .returning({ credits: balances.credits });

    if (updated.length === 0) {
      throw new Error(`Balance row not found for user ${userId}`);
    }

    await tx.insert(transactions).values({
      userId,
      type,
      amount:       microCredits,
      balanceAfter: updated[0]!.credits,
      ...(metadata.description  !== undefined ? { description: metadata.description } : {}),
      ...(metadata.redeemCodeId !== undefined ? { redeemCodeId: metadata.redeemCodeId } : {}),
      ...(metadata.adminId      !== undefined ? { adminId: metadata.adminId } : {}),
      ...(metadata.adminNote    !== undefined ? { adminNote: metadata.adminNote } : {}),
      ...(metadata.paymentId    !== undefined ? { paymentId: metadata.paymentId } : {}),
    });
  });
}

/** Create a fresh balance row for a new user */
export async function createBalanceForUser(
  userId: string,
  initialCredits = 0
): Promise<void> {
  await db.insert(balances).values({ userId, credits: initialCredits })
    .onConflictDoNothing();
}
