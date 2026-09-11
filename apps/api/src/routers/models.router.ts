import { router, publicProcedure, adminProcedure } from "./trpc";
import { z } from "zod";
import { db, models } from "@ai-platform/db";
import { eq } from "drizzle-orm";
import { CREDIT_VALUE_USD } from "@ai-platform/config";
import { syncModelsFromGateway } from "../services/model-sync.service";
import { TRPCError } from "@trpc/server";

function creditsPerK(wholesaleCostPerM: number, markup: number): number {
  return Math.ceil((wholesaleCostPerM * markup / 1000) / CREDIT_VALUE_USD);
}

export const modelsRouter = router({

  // Public: only status="published" AND isAvailable=true ever reaches users.
  // This — not New API, not the static MODEL_CATALOG — is now the single
  // source of truth the frontend should read from.
  list: publicProcedure.query(async () => {
    const rows = await db.query.models.findMany({
      where: (m, { and, eq }) => and(eq(m.status, "published"), eq(m.isAvailable, true)),
    });
    return rows.map((m) => ({
      id:               m.id,
      displayName:      m.displayName,
      displayNameAr:    m.displayNameAr,
      badge:            m.badge,
      tier:             m.tier,
      contextWindow:    m.contextWindow,
      maxOutputTokens:  m.maxOutputTokens,
      supportsVision:   m.supportsVision,
      creditsPerKInput:  creditsPerK(Number(m.wholesaleCostInputPerM),  Number(m.markupMultiplier)),
      creditsPerKOutput: creditsPerK(Number(m.wholesaleCostOutputPerM), Number(m.markupMultiplier)),
    }));
  }),

  // Admin: every row regardless of status/availability.
  listAll: adminProcedure.query(() => db.query.models.findMany()),

  // Admin: the discovery queue — models the gateway can serve that nobody
  // has configured pricing/display info for yet. This is what "Sync now"
  // populates; nothing here is visible to end users.
  pending: adminProcedure.query(() =>
    db.query.models.findMany({ where: eq(models.status, "pending") })
  ),

  // Admin: pull the current model list from New API's gateway and diff it
  // against this table. Discovers new models as pending, hides ones no
  // channel serves anymore. Never auto-publishes.
  sync: adminProcedure.mutation(async ({ ctx }) => {
    try {
      return await syncModelsFromGateway(ctx.user.id);
    } catch (err) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: err instanceof Error ? err.message : "Gateway sync failed",
      });
    }
  }),

  // Admin: the deliberate action that takes a pending (or previously
  // disabled) model live — sets its business-layer fields and flips it to
  // status="published", isAvailable=true.
  publish: adminProcedure
    .input(z.object({
      modelId:                 z.string(),
      displayName:             z.string().min(1).max(100),
      displayNameAr:           z.string().min(1).max(100),
      badge:                   z.string().max(10).optional(),
      tier:                    z.enum(["standard", "premium"]).default("standard"),
      markupMultiplier:        z.number().positive().default(2.0),
      contextWindow:           z.number().int().positive(),
      maxOutputTokens:         z.number().int().positive(),
      supportsVision:          z.boolean().default(false),
      wholesaleCostInputPerM:  z.number().min(0).default(0),
      wholesaleCostOutputPerM: z.number().min(0).default(0),
      rateLimitPerUserDaily:   z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(models)
        .set({
          displayName:             input.displayName,
          displayNameAr:           input.displayNameAr,
          badge:                   input.badge ?? "",
          tier:                    input.tier,
          markupMultiplier:        String(input.markupMultiplier),
          contextWindow:           input.contextWindow,
          maxOutputTokens:         input.maxOutputTokens,
          supportsVision:          input.supportsVision,
          wholesaleCostInputPerM:  String(input.wholesaleCostInputPerM),
          wholesaleCostOutputPerM: String(input.wholesaleCostOutputPerM),
          rateLimitPerUserDaily:   input.rateLimitPerUserDaily ?? null,
          status:                  "published",
          isAvailable:             true,
          updatedAt:               new Date(),
          updatedByAdminId:        ctx.user.id,
        })
        .where(eq(models.id, input.modelId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      return { success: true };
    }),

  toggleAvailability: adminProcedure
    .input(z.object({ modelId: z.string(), isAvailable: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(models)
        .set({ isAvailable: input.isAvailable, updatedAt: new Date(), updatedByAdminId: ctx.user.id })
        .where(eq(models.id, input.modelId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      return { success: true };
    }),
});
