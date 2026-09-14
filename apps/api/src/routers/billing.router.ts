import { z }                   from "zod";
import { router, protectedProcedure, publicProcedure } from "./trpc";
import { TRPCError }           from "@trpc/server";
import {
  db, balances, transactions, creditPackages, paymentMethods, pendingManualPayments, fraudEvents,
} from "@ai-platform/db";
import { eq, desc }            from "drizzle-orm";
import { redeemCode }          from "../services/redeem.service";
import { submitManualPayment } from "../services/manual-payment.service";
import { stripUndefined }      from "../utils/strip-undefined";
import { checkLimit }          from "../utils/rate-limiter";
import { FRAUD }               from "@ai-platform/config";

export const billingRouter = router({

  // ── Payment methods phase (Yemen market) — buyer-facing reads ───────
  // Public (not protected): the billing page's package/method picker
  // should render before we know whether the visitor is logged in, same
  // as models.list.
  listPackages: publicProcedure.query(() =>
    db.query.creditPackages.findMany({
      where: eq(creditPackages.isActive, true),
      orderBy: (p, { asc }) => [asc(p.sortOrder)],
    })
  ),

  listPaymentMethods: publicProcedure.query(() =>
    db.query.paymentMethods.findMany({
      where: eq(paymentMethods.isActive, true),
      orderBy: (m, { asc }) => [asc(m.sortOrder)],
    })
  ),

  submitManualPayment: protectedProcedure
    .input(z.object({
      packageId:       z.string().uuid(),
      paymentMethodId: z.string().uuid(),
      submittedTxRef:  z.string().max(150).optional(),
      senderPhone:     z.string().max(30).optional(),
      senderName:      z.string().max(100).optional(),
      screenshotUrl:   z.string().url().max(2048).optional(),
      notes:           z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Abuse protection (PAYMENT_METHODS_PLAN.md §7.10 "known gaps" — this
      // endpoint had none, unlike redeemCode()/checkLimit's use in
      // apps/web/app/api/redeem/route.ts, which this mirrors). A claim
      // isn't self-verifying the way a code is — every submission creates
      // work in the admin approval queue — so this blocks before even
      // reaching submitManualPayment(), and logs a fraud_events row so a
      // spike is visible in /admin/fraud rather than only in the queue.
      const userKey = `manualPayment:${ctx.user.id}`;
      if (!checkLimit(`${userKey}:hour`, FRAUD.MANUAL_PAYMENT_ATTEMPTS_PER_HOUR, 60 * 60 * 1000)) {
        await logManualPaymentAbuse(ctx.user.id, ctx.ip, "medium", "HOURLY_LIMIT");
        throw new TRPCError({ code: "TOO_MANY_REQUESTS",
          message: "تجاوزت عدد المحاولات المسموحة. حاول بعد ساعة." });
      }
      if (!checkLimit(`${userKey}:day`, FRAUD.MANUAL_PAYMENT_ATTEMPTS_PER_DAY, 24 * 60 * 60 * 1000)) {
        await logManualPaymentAbuse(ctx.user.id, ctx.ip, "high", "DAILY_LIMIT");
        throw new TRPCError({ code: "TOO_MANY_REQUESTS",
          message: "وصلت إلى الحد اليومي لطلبات التحويل. حاول غداً أو تواصل مع الدعم." });
      }
      // Per-IP, across accounts — same signal as SHARED_IP_MULTI_ACCOUNT
      // in fraud.service.ts, applied here since that class is Redis-backed
      // and nothing in this deploy instantiates a real Redis client for it
      // (see apps/api/src/services/fraud.service.ts's constructor — it's
      // unused/uncallable in production right now). checkLimit's in-memory
      // counter is what's actually wired up and running (redeem route),
      // so this stays consistent with that rather than adding a second,
      // half-working abuse-protection mechanism.
      if (!checkLimit(`manualPayment:ip:${ctx.ip}:hour`, FRAUD.MANUAL_PAYMENT_ATTEMPTS_PER_IP_PER_HOUR, 60 * 60 * 1000)) {
        await logManualPaymentAbuse(ctx.user.id, ctx.ip, "high", "IP_LIMIT");
        throw new TRPCError({ code: "TOO_MANY_REQUESTS",
          message: "عدد كبير من الطلبات من هذا الاتصال. حاول لاحقاً." });
      }

      const result = await submitManualPayment(ctx.user.id, stripUndefined(input));
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
      }
      return result;
    }),

  myManualPayments: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(({ ctx, input }) =>
      db.query.pendingManualPayments.findMany({
        where: eq(pendingManualPayments.userId, ctx.user.id),
        orderBy: [desc(pendingManualPayments.createdAt)],
        limit: input.limit,
      })
    ),

  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const row = await db.query.balances.findFirst({
      where: eq(balances.userId, ctx.user.id),
    });
    return {
      credits:        row?.credits       ?? 0,
      totalSpent:     row?.totalSpent    ?? 0,
      totalRedeemed:  row?.totalRedeemed ?? 0,
      displayCredits: (row?.credits ?? 0) / 1_000_000,
    };
  }),

  getTransactions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const items = await db.query.transactions.findMany({
        where: eq(transactions.userId, ctx.user.id),
        orderBy: [desc(transactions.createdAt)],
        limit:   input.limit,
        offset:  input.offset,
      });
      return { items, hasMore: items.length === input.limit };
    }),

  redeemCode: protectedProcedure
    .input(z.object({ code: z.string().min(1).max(32) }))
    .mutation(async ({ ctx, input }) => {
      // NOTE: not the live redeem path — the billing page posts to
      // apps/web/app/api/redeem/route.ts instead. That route also has
      // Turnstile + an in-memory checkLimit() in front. This path (API-key/
      // dev consumers of the tRPC router directly) previously had neither —
      // now it gets the same protection either way, since redeemCode()
      // itself runs FraudService.checkRedeemAttempt (Redis-backed, so it
      // applies here regardless of which entry point was used).
      const result = await redeemCode(ctx.user.id, input.code, ctx.ip);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
      }
      return result;
    }),
});

/**
 * Logs a `fraud_events` row when a manual-payment rate limit trips, so
 * spikes show up in /admin/fraud instead of only being visible as a wall
 * of pending claims in /admin/manual-payments. Reuses the generic
 * "SUSPICIOUS_PATTERN" fraud type (enums.ts) rather than adding a new
 * enum value + migration for this.
 */
async function logManualPaymentAbuse(
  userId: string,
  ip: string,
  severity: "low" | "medium" | "high" | "critical",
  reason: "HOURLY_LIMIT" | "DAILY_LIMIT" | "IP_LIMIT"
): Promise<void> {
  await db.insert(fraudEvents).values({
    userId, type: "SUSPICIOUS_PATTERN", severity,
    details: { source: "submitManualPayment", reason },
    ip,
  }).catch(() => { /* best-effort logging — never block/break the request over this */ });
}
