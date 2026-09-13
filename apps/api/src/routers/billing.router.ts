import { z }                   from "zod";
import { router, protectedProcedure, publicProcedure } from "./trpc";
import { TRPCError }           from "@trpc/server";
import {
  db, balances, transactions, creditPackages, paymentMethods, pendingManualPayments,
} from "@ai-platform/db";
import { eq, desc }            from "drizzle-orm";
import { redeemCode }          from "../services/redeem.service";
import { submitManualPayment } from "../services/manual-payment.service";
import { FraudService }        from "../services/fraud.service";

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
      const result = await submitManualPayment(ctx.user.id, input);
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
      const ip = ctx.ip;

      // Fraud check before attempting redeem
      // const fraud = new FraudService(redis);
      // const check = await fraud.checkRedeemAttempt(ctx.user.id, ip);
      // if (!check.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: check.reason });

      const result = await redeemCode(ctx.user.id, input.code);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
      }
      return result;
    }),
});
