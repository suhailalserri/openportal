import { z }               from "zod";
import { router, adminProcedure } from "./trpc";
import { TRPCError }       from "@trpc/server";
import {
  db, users, balances, transactions,
  redeemCodes, fraudEvents, auditLogs,
} from "@ai-platform/db";
import { eq, desc, count, sum, and, gte, sql } from "drizzle-orm";
import { creditBalance, deductCreditsAtomic } from "../services/balance.service";
import { generateCode }    from "../services/redeem.service";
import { config }          from "../config";

export const adminRouter = router({

  // ── Gateway channels (New API) ──────────────────────────────────────
  // The admin Channels page used to render hardcoded mock rows. This
  // calls New API's own channel-list admin endpoint with GATEWAY_ROOT_TOKEN.
  // Different New API deployments expect that token as a plain admin
  // access token for `/api/*` vs. only as the OpenAI-style key for
  // `/v1/*` — if yours is the latter, this will come back unauthorized;
  // see the error message for what to check.
  gatewayChannels: adminProcedure.query(async () => {
    let res: Response;
    try {
      res = await fetch(`${config.GATEWAY_URL}/api/channel/?p=0&page_size=100`, {
        // Admin routes need the system access token, not the chat-completions
        // key — see the note on GATEWAY_ROOT_TOKEN in config.ts.
        headers: { Authorization: `Bearer ${config.GATEWAY_ROOT_TOKEN}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: `Could not reach gateway: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    if (!res.ok) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message:
          `Gateway channel list returned ${res.status}. GATEWAY_ROOT_TOKEN must be a ` +
          `New API admin/system access token (Settings → Security & Access → Access Token ` +
          `on the gateway) — a regular chat-completions API key won't work here.`,
      });
    }

    const body = (await res.json().catch(() => null)) as
      | { data?: { items?: unknown[] } | unknown[] }
      | null;

    const rawItems: unknown[] = Array.isArray(body?.data)
      ? body.data
      : Array.isArray((body?.data as { items?: unknown[] } | undefined)?.items)
      ? (body!.data as { items: unknown[] }).items
      : [];

    return rawItems.map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        id:           Number(r.id ?? 0),
        name:         String(r.name ?? "unnamed"),
        type:         String(r.type ?? r.type_name ?? "unknown"),
        status:       Number(r.status ?? 0),
        responseTime: Number(r.response_time ?? r.test_time ?? 0),
        models:       typeof r.models === "string" ? (r.models as string).split(",").filter(Boolean) : [],
      };
    });
  }),

  // ── Dashboard stats ─────────────────────────────────────────────────
  getDashboardStats: adminProcedure.query(async () => {
    const [totalUsers]   = await db.select({ count: count() }).from(users);
    const [totalCredits] = await db.select({ total: sum(transactions.amount) })
      .from(transactions).where(eq(transactions.type, "redeem"));
    const [totalSpent]   = await db.select({ total: sum(transactions.amount) })
      .from(transactions).where(eq(transactions.type, "usage_debit"));

    return {
      totalUsers:   totalUsers?.count     ?? 0,
      totalRedeemed: Math.abs(Number(totalCredits?.total ?? 0)) / 1_000_000,
      totalSpent:    Math.abs(Number(totalSpent?.total   ?? 0)) / 1_000_000,
    };
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
  generateCodes: adminProcedure
    .input(z.object({
      count:       z.number().int().min(1).max(1000),
      creditValue: z.number().int().min(1),
      label:       z.string().min(1).max(100),
      expiresAt:   z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const batchId = crypto.randomUUID();
      const codes = Array.from({ length: input.count }, () => ({
        id:           crypto.randomUUID(),
        code:         generateCode(),
        creditAmount: input.creditValue * 1_000_000,
        faceValue:    `${input.creditValue} رصيد`,
        status:       "unused" as const,
        batchId,
        batchLabel:   input.label,
        createdByAdminId: ctx.user.id,
        expiresAt:    input.expiresAt ? new Date(input.expiresAt) : null,
      }));

      await db.insert(redeemCodes).values(codes);

      await db.insert(auditLogs).values({
        adminId:    ctx.user.id,
        action:     "codes.generate",
        targetType: "batch",
        after:      { count: input.count, value: input.creditValue, label: input.label, batchId },
        ip:         ctx.ip,
      });

      return { batchId, codes: codes.map(c => c.code), count: codes.length };
    }),

  listCodeBatches: adminProcedure.query(async () => {
    const rows = await db
      .select({
        batchId:    redeemCodes.batchId,
        batchLabel: redeemCodes.batchLabel,
        total:      count(),
        used:       sql<number>`count(*) filter (where status = 'used')`,
        expired:    sql<number>`count(*) filter (where status = 'expired')`,
        createdAt:  sql<Date>`min(created_at)`,
      })
      .from(redeemCodes)
      .groupBy(redeemCodes.batchId, redeemCodes.batchLabel)
      .orderBy(desc(sql`min(created_at)`));
    return rows;
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
});
