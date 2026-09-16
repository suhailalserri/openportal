import { z }               from "zod";
import { router, adminProcedure } from "./trpc";
import { TRPCError }       from "@trpc/server";
import {
  db, users, balances, transactions,
  redeemCodes, fraudEvents, auditLogs,
  creditPackages, paymentMethods, pendingManualPayments,
} from "@ai-platform/db";
import { eq, desc, count, and, sql } from "drizzle-orm";
import { creditBalance, deductCreditsAtomic } from "../services/balance.service";
import { generateCode }    from "../services/redeem.service";
import { approveManualPayment, rejectManualPayment } from "../services/manual-payment.service";
import {
  getDashboardStats as computeDashboardStats,
  getRevenueTimeseries,
  getModelUsageBreakdown,
  getRecentTransactions,
} from "../services/dashboard.service";
import { stripUndefined }  from "../utils/strip-undefined";
import { fetchGatewayChannels } from "../services/gateway-channels.service";

export const adminRouter = router({

  // ── Gateway channels (New API) ──────────────────────────────────────
  // The admin Channels page used to render hardcoded mock rows. This
  // calls New API's own channel-list admin endpoint with GATEWAY_ROOT_TOKEN.
  // Different New API deployments expect that token as a plain admin
  // access token for `/api/*` vs. only as the OpenAI-style key for
  // `/v1/*` — if yours is the latter, this will come back unauthorized;
  // see the error message for what to check.
  gatewayChannels: adminProcedure.query(async () => {
    try {
      return await fetchGatewayChannels();
    } catch (err) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }),

  // ── Dashboard stats ─────────────────────────────────────────────────
  // Real numbers (revenue/cost/margin/active users), replacing the
  // hardcoded-zero admin dashboard. See dashboard.service.ts for the
  // revenue-recognition and USD/YER methodology notes.
  //
  // Each of these wraps its service call in try/catch and rethrows as a
  // TRPCError carrying the *original* error message. Without this, a
  // thrown Postgres/driver error becomes an opaque 500 with no detail in
  // the browser's network tab — and (until the sibling fix in
  // apps/web/app/api/trpc/[trpc]/route.ts) wasn't even reaching the
  // server logs. This makes the real cause visible from the client side
  // alone, no log access required.
  getDashboardStats: adminProcedure.query(async () => {
    try {
      return await computeDashboardStats();
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `getDashboardStats failed: ${err instanceof Error ? err.message : String(err)}`,
        cause: err,
      });
    }
  }),

  getRevenueTimeseries: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(14) }))
    .query(async ({ input }) => {
      try {
        return await getRevenueTimeseries(input.days);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `getRevenueTimeseries failed: ${err instanceof Error ? err.message : String(err)}`,
          cause: err,
        });
      }
    }),

  getModelUsageBreakdown: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
    .query(async ({ input }) => {
      try {
        return await getModelUsageBreakdown(input.days);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `getModelUsageBreakdown failed: ${err instanceof Error ? err.message : String(err)}`,
          cause: err,
        });
      }
    }),

  getRecentTransactions: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      try {
        return await getRecentTransactions(input.limit);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `getRecentTransactions failed: ${err instanceof Error ? err.message : String(err)}`,
          cause: err,
        });
      }
    }),

  // ── User management ─────────────────────────────────────────────────
  listUsers: adminProcedure
    .input(z.object({
      limit:  z.number().default(50),
      offset: z.number().default(0),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await db.query.users.findMany({
        limit:   input.limit,
        offset:  input.offset,
        orderBy: [desc(users.createdAt)],
        columns: {
          passwordHash: false,
          apiKeyHash:   false,
          twoFactorSecret: false,
        },
      });
      return { items: rows, hasMore: rows.length === input.limit };
    }),

  getUserDetail: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ input }) => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
        columns: { passwordHash: false, apiKeyHash: false, twoFactorSecret: false },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const balance = await db.query.balances.findFirst({
        where: eq(balances.userId, input.userId),
      });
      const recentTxns = await db.query.transactions.findMany({
        where: eq(transactions.userId, input.userId),
        orderBy: [desc(transactions.createdAt)],
        limit: 20,
      });

      return { user, balance, recentTxns };
    }),

  updateUserStatus: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      status: z.enum(["active", "suspended"]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.update(users)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await db.insert(auditLogs).values({
        adminId:    ctx.user.id,
        action:     `user.${input.status}`,
        targetType: "user",
        targetId:   input.userId,
        after:      { status: input.status, reason: input.reason },
        ip:         ctx.ip,
      });

      return { success: true };
    }),

  adjustCredits: adminProcedure
    .input(z.object({
      userId:      z.string().uuid(),
      amount:      z.number().int(),
      type:        z.enum(["admin_credit", "admin_debit"]),
      reason:      z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // input.amount is always a positive count of credits the admin entered;
      // `type` decides direction. Using Math.abs guards against a negative
      // amount silently flipping an "admin_credit" into a debit or vice versa.
      const microCredits = Math.abs(input.amount) * 1_000_000;

      if (input.type === "admin_credit") {
        await creditBalance(input.userId, microCredits, "admin_credit", {
          description: input.reason,
          adminId:     ctx.user.id,
          adminNote:   input.reason,
        });
      } else {
        const result = await deductCreditsAtomic(
          input.userId,
          microCredits,
          input.reason,
          {},
          db,
          "admin_debit"
        );
        if (!result.success) {
          throw new TRPCError({
            code:    "BAD_REQUEST",
            message: "Cannot debit more credits than the user's current balance.",
          });
        }
      }

      await db.insert(auditLogs).values({
        adminId:    ctx.user.id,
        action:     "user.adjustCredits",
        targetType: "user",
        targetId:   input.userId,
        after:      { amount: input.amount, type: input.type, reason: input.reason },
        ip:         ctx.ip,
      });

      return { success: true };
    }),

  // ── Redeem code management ──────────────────────────────────────────
  // `packageId`/`paymentMethodId` are optional so ad-hoc batches (no
  // package picked — e.g. a one-off promo) keep working exactly as
  // before (PAYMENT_METHODS_PLAN.md §4: tagging only, no behavior
  // change). When a packageId IS given, creditValue/label are derived
  // from the package so the batch can't drift from what's actually being
  // sold — the UI still sends them for the audit-log snapshot and for the
  // ad-hoc (no package) case.
  generateCodes: adminProcedure
    .input(z.object({
      count:           z.number().int().min(1).max(1000),
      creditValue:     z.number().int().min(1),
      label:           z.string().min(1).max(100),
      expiresAt:       z.string().datetime().optional(),
      packageId:       z.string().uuid().optional(),
      paymentMethodId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let creditValue = input.creditValue;
      let faceValue   = `${input.creditValue} رصيد`;

      if (input.packageId) {
        const pkg = await db.query.creditPackages.findFirst({ where: eq(creditPackages.id, input.packageId) });
        if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
        creditValue = pkg.credits / 1_000_000;
        faceValue   = pkg.nameAr;
      }

      const batchId = crypto.randomUUID();
      const codes = Array.from({ length: input.count }, () => ({
        id:           crypto.randomUUID(),
        code:         generateCode(),
        creditAmount: creditValue * 1_000_000,
        faceValue,
        status:       "unused" as const,
        batchId,
        batchLabel:   input.label,
        createdByAdminId: ctx.user.id,
        expiresAt:    input.expiresAt ? new Date(input.expiresAt) : null,
        packageId:       input.packageId ?? null,
        paymentMethodId: input.paymentMethodId ?? null,
      }));

      await db.insert(redeemCodes).values(codes);

      await db.insert(auditLogs).values({
        adminId:    ctx.user.id,
        action:     "codes.generate",
        targetType: "batch",
        after:      {
          count: input.count, value: creditValue, label: input.label, batchId,
          packageId: input.packageId ?? null, paymentMethodId: input.paymentMethodId ?? null,
        },
        ip:         ctx.ip,
      });

      return { batchId, codes: codes.map(c => c.code), count: codes.length };
    }),

  listCodeBatches: adminProcedure.query(async () => {
    const rows = await db
      .select({
        batchId:         redeemCodes.batchId,
        batchLabel:      redeemCodes.batchLabel,
        packageId:       redeemCodes.packageId,
        paymentMethodId: redeemCodes.paymentMethodId,
        total:           count(),
        used:            sql<number>`count(*) filter (where status = 'used')`,
        expired:         sql<number>`count(*) filter (where status = 'expired')`,
        createdAt:       sql<Date>`min(created_at)`,
      })
      .from(redeemCodes)
      .groupBy(redeemCodes.batchId, redeemCodes.batchLabel, redeemCodes.packageId, redeemCodes.paymentMethodId)
      .orderBy(desc(sql`min(created_at)`));
    return rows;
  }),

  // Tracking dashboard (PAYMENT_METHODS_PLAN.md §7.6): payment method ×
  // package — generated / redeemed / remaining, flagged when stock runs
  // low. "Remaining" excludes expired/revoked codes since those can never
  // be claimed again.
  codeInventory: adminProcedure
    .input(z.object({ lowStockThreshold: z.number().int().min(0).default(20) }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          paymentMethodId: redeemCodes.paymentMethodId,
          packageId:       redeemCodes.packageId,
          generated:       count(),
          redeemed:        sql<number>`count(*) filter (where status = 'used')`,
          remaining:       sql<number>`count(*) filter (where status = 'unused')`,
        })
        .from(redeemCodes)
        .where(and(sql`${redeemCodes.paymentMethodId} is not null`, sql`${redeemCodes.packageId} is not null`))
        .groupBy(redeemCodes.paymentMethodId, redeemCodes.packageId);

      return rows.map((r) => ({
        ...r,
        lowStock: r.remaining < input.lowStockThreshold,
      }));
    }),

  revokeCodeBatch: adminProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.update(redeemCodes)
        .set({ status: "revoked" })
        .where(and(eq(redeemCodes.batchId, input.batchId), eq(redeemCodes.status, "unused")))
        .returning({ id: redeemCodes.id });

      await db.insert(auditLogs).values({
        adminId: ctx.user.id, action: "codes.revokeBatch",
        targetType: "batch", targetId: input.batchId,
        after: { revokedCount: result.length }, ip: ctx.ip,
      });

      return { success: true, revokedCount: result.length };
    }),

  // Per-batch export (PAYMENT_METHODS_PLAN.md §7.7) — returns the actual
  // codes for one batch so the client can build a CSV or a print-friendly
  // "cards" view. `listCodeBatches` only returns aggregates, deliberately
  // kept cheap for the batches table; this is the drill-down.
  getBatchCodes: adminProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(async ({ input }) => {
      const codes = await db.query.redeemCodes.findMany({
        where: eq(redeemCodes.batchId, input.batchId),
        orderBy: [desc(redeemCodes.createdAt)],
      });
      if (codes.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      return codes;
    }),

  revokeCode: adminProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(redeemCodes)
        .set({ status: "revoked" })
        .where(and(eq(redeemCodes.code, input.code), eq(redeemCodes.status, "unused")));

      await db.insert(auditLogs).values({
        adminId: ctx.user.id,
        action:  "codes.revoke",
        after:   { code: input.code },
        ip:      ctx.ip,
      });

      return { success: true };
    }),

  // ── Fraud management ────────────────────────────────────────────────
  listFraudEvents: adminProcedure
    .input(z.object({
      resolved: z.boolean().default(false),
      limit:    z.number().default(50),
    }))
    .query(async ({ input }) => {
      return db.query.fraudEvents.findMany({
        where: eq(fraudEvents.resolved, input.resolved),
        orderBy: [desc(fraudEvents.createdAt)],
        limit: input.limit,
      });
    }),

  resolveFraudEvent: adminProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(fraudEvents)
        .set({ resolved: true, resolvedBy: ctx.user.id, resolvedAt: new Date() })
        .where(eq(fraudEvents.id, input.eventId));
      return { success: true };
    }),

  clearFraudFlag: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(users)
        .set({ isFraudFlagged: false, fraudReason: null, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await db.insert(auditLogs).values({
        adminId: ctx.user.id, action: "user.clearFraudFlag",
        targetType: "user", targetId: input.userId, ip: ctx.ip,
      });

      return { success: true };
    }),

  // ── Packages (PAYMENT_METHODS_PLAN.md §7.3) ─────────────────────────
  listPackages: adminProcedure.query(() =>
    db.query.creditPackages.findMany({ orderBy: (p, { asc }) => [asc(p.sortOrder)] })
  ),

  createPackage: adminProcedure
    .input(z.object({
      name:               z.string().min(1).max(100),
      nameAr:             z.string().min(1).max(100),
      priceYer:           z.number().int().positive(),
      priceUsdEquivalent: z.number().positive(),
      credits:            z.number().int().positive(), // display credits — converted to micro-credits below
      description:        z.string().max(1000).optional(),
      descriptionAr:      z.string().max(1000).optional(),
      sortOrder:          z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db.insert(creditPackages).values(stripUndefined({
        ...input,
        priceUsdEquivalent: String(input.priceUsdEquivalent),
        credits:            input.credits * 1_000_000,
      })).returning();

      await db.insert(auditLogs).values({
        adminId: ctx.user.id, action: "package.create",
        targetType: "package", targetId: row!.id, after: input, ip: ctx.ip,
      });
      return row;
    }),

  updatePackage: adminProcedure
    .input(z.object({
      id:                 z.string().uuid(),
      name:               z.string().min(1).max(100).optional(),
      nameAr:             z.string().min(1).max(100).optional(),
      priceYer:           z.number().int().positive().optional(),
      priceUsdEquivalent: z.number().positive().optional(),
      credits:            z.number().int().positive().optional(), // display credits
      description:        z.string().max(1000).optional(),
      descriptionAr:      z.string().max(1000).optional(),
      isActive:           z.boolean().optional(),
      sortOrder:          z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, priceUsdEquivalent, credits, ...rest } = input;
      const [before] = await db.select().from(creditPackages).where(eq(creditPackages.id, id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await db.update(creditPackages)
        .set(stripUndefined({
          ...rest,
          priceUsdEquivalent: priceUsdEquivalent !== undefined ? String(priceUsdEquivalent) : undefined,
          credits:            credits !== undefined ? credits * 1_000_000 : undefined,
          updatedAt: new Date(),
        }))
        .where(eq(creditPackages.id, id))
        .returning();

      await db.insert(auditLogs).values({
        adminId: ctx.user.id, action: "package.update",
        targetType: "package", targetId: id, before, after: updated, ip: ctx.ip,
      });
      return updated;
    }),

  // ── Payment methods (PAYMENT_METHODS_PLAN.md §7.4) ──────────────────
  listPaymentMethods: adminProcedure.query(() =>
    db.query.paymentMethods.findMany({ orderBy: (m, { asc }) => [asc(m.sortOrder)] })
  ),

  createPaymentMethod: adminProcedure
    .input(z.object({
      name:           z.string().min(1).max(100),
      nameAr:         z.string().min(1).max(100),
      type:           z.enum(["jaib_voucher", "manual_transfer"]),
      logoUrl:        z.string().url().max(2048).optional(),
      accountCode:    z.string().max(100).optional(),
      instructions:   z.string().max(2000).optional(),
      instructionsAr: z.string().max(2000).optional(),
      sortOrder:      z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db.insert(paymentMethods).values(stripUndefined(input)).returning();
      await db.insert(auditLogs).values({
        adminId: ctx.user.id, action: "paymentMethod.create",
        targetType: "paymentMethod", targetId: row!.id, after: input, ip: ctx.ip,
      });
      return row;
    }),

  updatePaymentMethod: adminProcedure
    .input(z.object({
      id:             z.string().uuid(),
      name:           z.string().min(1).max(100).optional(),
      nameAr:         z.string().min(1).max(100).optional(),
      logoUrl:        z.string().url().max(2048).optional(),
      accountCode:    z.string().max(100).optional(),
      instructions:   z.string().max(2000).optional(),
      instructionsAr: z.string().max(2000).optional(),
      isActive:       z.boolean().optional(),
      sortOrder:      z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [before] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await db.update(paymentMethods)
        .set(stripUndefined({ ...rest, updatedAt: new Date() }))
        .where(eq(paymentMethods.id, id))
        .returning();

      await db.insert(auditLogs).values({
        adminId: ctx.user.id, action: "paymentMethod.update",
        targetType: "paymentMethod", targetId: id, before, after: updated, ip: ctx.ip,
      });
      return updated;
    }),

  // ── Manual-transfer approval queue (PAYMENT_METHODS_PLAN.md §7.10) ──
  listManualPayments: adminProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected"]).default("pending"),
      limit:  z.number().int().min(1).max(100).default(50),
    }))
    .query(({ input }) =>
      // No Drizzle `relations()` config exists in this schema (every other
      // router does manual lookups too — see getUserDetail's pattern), so
      // join the three tables explicitly rather than using `with`.
      db
        .select({
          claim:           pendingManualPayments,
          userEmail:       users.email,
          userDisplayName: users.displayName,
          packageName:     creditPackages.name,
          packageNameAr:   creditPackages.nameAr,
          packagePriceYer: creditPackages.priceYer,
          methodName:      paymentMethods.name,
          methodNameAr:    paymentMethods.nameAr,
        })
        .from(pendingManualPayments)
        .leftJoin(users,          eq(pendingManualPayments.userId, users.id))
        .leftJoin(creditPackages, eq(pendingManualPayments.packageId, creditPackages.id))
        .leftJoin(paymentMethods, eq(pendingManualPayments.paymentMethodId, paymentMethods.id))
        .where(eq(pendingManualPayments.status, input.status))
        .orderBy(desc(pendingManualPayments.createdAt))
        .limit(input.limit)
    ),

  approveManualPayment: adminProcedure
    .input(z.object({ claimId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await approveManualPayment(input.claimId, ctx.user.id);
      if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });

      await db.insert(auditLogs).values({
        adminId: ctx.user.id, action: "manualPayment.approve",
        targetType: "pendingManualPayment", targetId: input.claimId, ip: ctx.ip,
      });
      return result;
    }),

  rejectManualPayment: adminProcedure
    .input(z.object({ claimId: z.string().uuid(), reason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const result = await rejectManualPayment(input.claimId, ctx.user.id, input.reason);
      if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });

      await db.insert(auditLogs).values({
        adminId: ctx.user.id, action: "manualPayment.reject",
        targetType: "pendingManualPayment", targetId: input.claimId,
        after: { reason: input.reason }, ip: ctx.ip,
      });
      return result;
    }),
});
