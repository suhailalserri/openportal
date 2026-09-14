import { db, users } from "@ai-platform/db";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { REFERRAL_BONUS_MICRO_CREDITS } from "@ai-platform/config";
import { creditBalance } from "./balance.service";

type Executor = typeof db;

/**
 * Award the referrer's bonus, exactly once, the first time the user they
 * referred completes a real payment. Call this from inside the SAME
 * transaction as the credit grant that qualifies as "first payment" —
 * currently `redeemCode()` and `approveManualPayment()` — passing `tx`
 * through, same pattern as `creditBalance()` itself.
 *
 * Deliberately NOT fired at signup (decisions.md ADR-009): rewarding
 * account creation alone is a well-known farming vector — create N
 * throwaway accounts, claim N bonuses, zero real revenue.
 *
 * Race-safe / idempotent: the atomic claim is the UPDATE below — it only
 * matches (and only one concurrent caller can ever match) a row that
 * HAS a referrer AND has never been awarded. Mirrors redeemCode()'s
 * status flip and approveManualPayment()'s pending→approved flip.
 */
export async function maybeAwardReferralBonus(
  referredUserId: string,
  executor: Executor = db
): Promise<void> {
  if (REFERRAL_BONUS_MICRO_CREDITS <= 0) return;

  await executor.transaction(async (tx) => {
    const claimed = await tx
      .update(users)
      .set({ referralBonusAwardedAt: new Date() })
      .where(and(
        eq(users.id, referredUserId),
        isNotNull(users.referredByUserId),
        isNull(users.referralBonusAwardedAt)
      ))
      .returning({ referredByUserId: users.referredByUserId });

    if (claimed.length === 0) return; // no referrer, or already awarded — no-op

    const referrerId = claimed[0]!.referredByUserId;
    if (!referrerId) return; // unreachable given the isNotNull filter above, but keeps TS honest

    await creditBalance(
      referrerId,
      REFERRAL_BONUS_MICRO_CREDITS,
      "referral_bonus",
      { description: "مكافأة إحالة صديق" },
      tx
    );
  });
}

export interface ReferralStats {
  referralCode:  string | null;
  referredCount: number;
  bonusesAwarded: number;
  totalBonusMicroCredits: number;
}

/** For the settings/billing referral card — the user's own code + how it's performed so far. */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const me = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { referralCode: true },
  });

  const referred = await db.query.users.findMany({
    where: eq(users.referredByUserId, userId),
    columns: { referralBonusAwardedAt: true },
  });

  const bonusesAwarded = referred.filter((r) => r.referralBonusAwardedAt !== null).length;

  return {
    referralCode:  me?.referralCode ?? null,
    referredCount: referred.length,
    bonusesAwarded,
    totalBonusMicroCredits: bonusesAwarded * REFERRAL_BONUS_MICRO_CREDITS,
  };
}
