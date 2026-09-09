import { db, redeemCodes } from "@ai-platform/db";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { creditBalance } from "./balance.service";
import type { RedeemResult } from "@ai-platform/types";

/** Generate a checksum-protected code: XXXX-XXXX-XXXX-CHCK */
export function generateCode(): string {
  // No ambiguous chars (0/O, 1/I/L)
  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const randomBytes = new Uint8Array(12);
  crypto.getRandomValues(randomBytes);

  const seg = (start: number) =>
    Array.from(randomBytes.slice(start, start + 4))
      .map((b) => CHARS[b % CHARS.length])
      .join("");

  const body = `${seg(0)}-${seg(4)}-${seg(8)}`;
  const checksum = createHmac("sha256", process.env.CODE_SALT ?? "default-salt")
    .update(body)
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();

  return `${body}-${checksum}`;
}

/** Validate code format via checksum before hitting DB */
export function validateCodeFormat(code: string): boolean {
  const parts = code.toUpperCase().trim().split("-");
  if (parts.length !== 4 || !parts.every((p) => p.length === 4)) return false;

  const body = parts.slice(0, 3).join("-");
  const expected = createHmac("sha256", process.env.CODE_SALT ?? "default-salt")
    .update(body)
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();

  return parts[3] === expected;
}

/** Atomically redeem a code — race-safe via DB-level single-use constraint */
export async function redeemCode(
  userId: string,
  rawCode: string
): Promise<RedeemResult> {
  const code = rawCode.toUpperCase().trim();

  if (!validateCodeFormat(code)) {
    return {
      success: false,
      error:   "INVALID_FORMAT",
      message: "صيغة الكود غير صحيحة. تحقق من الكود وأعد المحاولة.",
    };
  }

  return await db.transaction(async (tx) => {
    // Atomic claim: only succeeds if status = 'unused' AND not expired
    const claimed = await tx
      .update(redeemCodes)
      .set({ status: "used", usedByUserId: userId, usedAt: new Date() })
      .where(
        and(
          eq(redeemCodes.code, code),
          eq(redeemCodes.status, "unused"),
          or(isNull(redeemCodes.expiresAt), gt(redeemCodes.expiresAt, new Date()))
        )
      )
      .returning();

    if (claimed.length === 0) {
      // Find out WHY for a helpful error message
      const existing = await tx
        .select({ status: redeemCodes.status, expiresAt: redeemCodes.expiresAt })
        .from(redeemCodes)
        .where(eq(redeemCodes.code, code))
        .limit(1);

      if (!existing.length)
        return { success: false, error: "NOT_FOUND" as const,    message: "الكود غير موجود." };
      if (existing[0]!.status === "used")
        return { success: false, error: "ALREADY_USED" as const, message: "تم استخدام هذا الكود مسبقاً." };
      if (existing[0]!.status === "revoked")
        return { success: false, error: "REVOKED" as const,      message: "هذا الكود ملغي. تواصل مع الدعم." };
      if (existing[0]!.expiresAt && existing[0]!.expiresAt < new Date())
        return { success: false, error: "EXPIRED" as const,      message: "انتهت صلاحية هذا الكود." };

      return { success: false, error: "GENERIC" as const, message: "الكود غير صالح." };
    }

    const { creditAmount, id: codeId } = claimed[0]!;

    // Pass `tx` through so the credit grant is a SAVEPOINT nested inside
    // THIS transaction, not a second independent transaction on another
    // connection. If anything below fails, the code claim AND the credit
    // roll back together — never one without the other.
    await creditBalance(
      userId,
      creditAmount,
      "redeem",
      { description: `استبدال كود: ${code}`, redeemCodeId: codeId },
      tx
    );

    return {
      success:       true,
      creditsAdded:  creditAmount,
      message:       `تم إضافة ${(creditAmount / 1_000_000).toFixed(0)} رصيد بنجاح! 🎉`,
    };
  });
}
