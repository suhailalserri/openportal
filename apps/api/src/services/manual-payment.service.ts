import {
  db, pendingManualPayments, creditPackages, paymentMethods, transactions,
} from "@ai-platform/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { creditBalance } from "./balance.service";
import { maybeAwardReferralBonus } from "./referral.service";
import { stripUndefined } from "../utils/strip-undefined";
import type { ManualPaymentSubmitResult, ManualPaymentReviewResult } from "@ai-platform/types";

/**
 * Short, human-typeable reference code the buyer writes as their transfer
 * note/memo. Unlike redeem codes (ADR-004), this is NOT a bearer
 * credential — it never grants credits by itself, it's only a matching
 * aid so an admin can find the right incoming transfer. No checksum
 * needed; the `pending_manual_payments.reference_code` UNIQUE constraint
 * is the only collision guard required.
 */
function generateReferenceCode(): string {
  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  const body  = Array.from(bytes).map((b) => CHARS[b % CHARS.length]).join("");
  return `REF-${body}`;
}

export interface SubmitManualPaymentInput {
  packageId:       string;
  paymentMethodId: string;
  submittedTxRef?: string;
  senderPhone?:    string;
  senderName?:     string;
  screenshotUrl?:  string;
  notes?:          string;
}

/** Buyer submits a claim: "I transferred X, here's my reference." */
export async function submitManualPayment(
  userId: string,
  input:  SubmitManualPaymentInput
): Promise<ManualPaymentSubmitResult> {
  const pkg = await db.query.creditPackages.findFirst({
    where: and(eq(creditPackages.id, input.packageId), eq(creditPackages.isActive, true)),
  });
  if (!pkg) {
    return { success: false, error: "PACKAGE_NOT_FOUND", message: "الباقة غير موجودة أو غير متاحة حالياً." };
  }

  const method = await db.query.paymentMethods.findFirst({
    where: eq(paymentMethods.id, input.paymentMethodId),
  });
  if (!method) {
    return { success: false, error: "PAYMENT_METHOD_NOT_FOUND", message: "طريقة الدفع غير موجودة." };
  }
  if (!method.isActive || method.type !== "manual_transfer") {
    return { success: false, error: "PAYMENT_METHOD_INACTIVE", message: "طريقة الدفع هذه غير متاحة للمطالبات اليدوية حالياً." };
  }

  // Collision odds on a 6-byte/32-char alphabet code are astronomically
  // low, but the column is UNIQUE — retry a handful of times rather than
  // let a freak collision surface as a raw DB error to the buyer.
  let referenceCode = generateReferenceCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db.query.pendingManualPayments.findFirst({
      where: eq(pendingManualPayments.referenceCode, referenceCode),
    });
    if (!clash) break;
    referenceCode = generateReferenceCode();
  }

  const [row] = await db.insert(pendingManualPayments).values(stripUndefined({
    userId,
    packageId:       pkg.id,
    paymentMethodId: method.id,
    referenceCode,
    submittedTxRef:  input.submittedTxRef,
    senderPhone:     input.senderPhone,
    senderName:      input.senderName,
    screenshotUrl:   input.screenshotUrl,
    notes:           input.notes,
  })).returning();

  return {
    success:       true,
    referenceCode,
    claimId:       row!.id,
    message:       `تم إرسال طلبك بنجاح. رمز المرجع: ${referenceCode}. سيتم إضافة رصيدك بعد التحقق من التحويل.`,
  };
}

/**
 * Admin approves a claim → credits the buyer directly via the same atomic
 * ledger function every other credit grant uses (Prompt.md rule 4: every
 * credit movement is a `transactions` row). Deliberately does NOT touch
 * `redeem_codes` — see pending-manual-payments.ts's header comment / ADR-008
 * for why manual-transfer approval and Jaib redemption are different
 * mechanisms despite both being "payment methods" in the same plan.
 *
 * Race-safe: the status flip from 'pending'→'approved' is the atomic
 * claim (mirrors redeemCode()'s single-use guarantee) — if two admins
 * click approve on the same claim at once, only one UPDATE matches the
 * `status = 'pending'` predicate and only one credit grant happens.
 */
export async function approveManualPayment(
  claimId: string,
  adminId: string
): Promise<ManualPaymentReviewResult> {
  return await db.transaction(async (tx) => {
    const [claim] = await tx
      .update(pendingManualPayments)
      .set({ status: "approved", reviewedByAdminId: adminId, reviewedAt: new Date() })
      .where(and(eq(pendingManualPayments.id, claimId), eq(pendingManualPayments.status, "pending")))
      .returning();

    if (!claim) {
      return { success: false, message: "الطلب غير موجود أو تمت مراجعته مسبقاً." };
    }

    const pkg = await tx.query.creditPackages.findFirst({
      where: eq(creditPackages.id, claim.packageId),
    });
    if (!pkg) {
      // FK guarantees this row exists in practice — fail loudly rather
      // than silently approve a claim with zero credits granted.
      throw new Error(`approveManualPayment: package ${claim.packageId} missing for claim ${claimId}`);
    }

    await creditBalance(
      claim.userId,
      pkg.credits,
      "payment",
      { description: `تحويل يدوي معتمد — ${pkg.nameAr} (مرجع ${claim.referenceCode})`, paymentId: claim.id },
      tx
    );

    // First real payment from this buyer → award their referrer, if any.
    await maybeAwardReferralBonus(claim.userId, tx);

    // Link the ledger row back onto the claim for a direct audit trail.
    const [txRow] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.paymentId, claim.id))
      .limit(1);
    if (txRow) {
      await tx.update(pendingManualPayments)
        .set({ grantedTransactionId: txRow.id })
        .where(eq(pendingManualPayments.id, claim.id));
    }

    return { success: true, message: "تم اعتماد الطلب وإضافة الرصيد إلى حساب المستخدم." };
  });
}

export async function rejectManualPayment(
  claimId: string,
  adminId: string,
  reason:  string
): Promise<ManualPaymentReviewResult> {
  const [claim] = await db
    .update(pendingManualPayments)
    .set({ status: "rejected", reviewedByAdminId: adminId, reviewedAt: new Date(), rejectionReason: reason })
    .where(and(eq(pendingManualPayments.id, claimId), eq(pendingManualPayments.status, "pending")))
    .returning();

  if (!claim) {
    return { success: false, message: "الطلب غير موجود أو تمت مراجعته مسبقاً." };
  }
  return { success: true, message: "تم رفض الطلب." };
}
