import { z }                   from "zod";
import { router, protectedProcedure } from "./trpc";
import { TRPCError }           from "@trpc/server";
import { db, balances, transactions } from "@ai-platform/db";
import { eq, desc }            from "drizzle-orm";
import { redeemCode }          from "../services/redeem.service";
import { FraudService }        from "../services/fraud.service";

export const billingRouter = router({

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
      const ip = ctx.req.headers["cf-connecting-ip"] as string
              ?? ctx.req.headers["x-forwarded-for"] as string
              ?? ctx.req.ip
              ?? "unknown";

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
