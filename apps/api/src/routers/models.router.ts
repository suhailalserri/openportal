import { router, publicProcedure, adminProcedure } from "./trpc";
import { z } from "zod";
import { db, models } from "@ai-platform/db";
import { eq } from "drizzle-orm";
import {
  CREDIT_VALUE_USD,
  ADMIN_BADGE_KEYS,
  MODEL_CATEGORY_KEYS,
  LEADERBOARD_CATEGORY_KEYS,
  sanitizeAdminBadge,
} from "@ai-platform/config";
import { syncModelsFromGateway } from "../services/model-sync.service";
import { TRPCError } from "@trpc/server";
import { LIMITS, modelIdSchema } from "../security/limits";

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
      badge:            sanitizeAdminBadge(m.badge),
      provider:         m.provider,
      providerIconKey:  m.providerIconKey,
      tier:             m.tier,
      contextWindow:    m.contextWindow,
      maxOutputTokens:  m.maxOutputTokens,
      supportsVision:   m.supportsVision,
      categories:       m.categories,
      categoryScores:   m.categoryScores,
      avgResponseTimeMs: m.avgResponseTimeMs,
      creditsPerKInput:  creditsPerK(Number(m.wholesaleCostInputPerM),  Number(m.markupMultiplier)),
      creditsPerKOutput: creditsPerK(Number(m.wholesaleCostOutputPerM), Number(m.markupMultiplier)),
    }));
  }),

  // Admin: every row regardless of status/availability. Badge is
  // sanitized on the way out (see sanitizeAdminBadge) — legacy rows can
  // still carry a pre-picker freeform value (an emoji, "FREE", etc.);
  // without this, reopening one of those rows in the form dialog and
  // saving without touching the badge field fails with an opaque
  // "Invalid enum value" error, since `publish`'s zod schema has always
  // rejected anything outside ADMIN_BADGE_KEYS.
  listAll: adminProcedure.query(async () => {
    const rows = await db.query.models.findMany();
    return rows.map((m) => ({ ...m, badge: sanitizeAdminBadge(m.badge) }));
  }),

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
      modelId:                 modelIdSchema,
      displayName:             z.string().min(1).max(100),
      displayNameAr:           z.string().min(1).max(100),
      badge:                   z.enum(ADMIN_BADGE_KEYS).optional(),
      providerIconKey:         z.string().max(50).optional(),
      tier:                    z.enum(["standard", "premium"]).default("standard"),
      markupMultiplier:        z.number().positive().max(100).default(2.0),
      contextWindow:           z.number().int().positive().max(10_000_000),
      maxOutputTokens:         z.number().int().positive().max(10_000_000),
      supportsVision:          z.boolean().default(false),
      // Unrecognized values are dropped rather than rejected — an older
      // client tab open during a deploy that adds a new category
      // shouldn't get a hard validation error on save.
      categories:              z.array(z.string().max(LIMITS.LIST_ITEM_MAX)).max(LIMITS.LIST_MAX).default([])
                                 .transform((cats) => cats.filter((c) => (MODEL_CATEGORY_KEYS as readonly string[]).includes(c))),
      // Admin-entered benchmark scores (0-100) per LEADERBOARD_CATEGORY_KEYS
      // (e.g. copied in from livebench.ai). Unrecognized keys dropped for
      // the same forward-compat reason as `categories` above; out-of-range
      // values rejected outright since these come from a form, not a stale
      // client's stored list.
      categoryScores:          z.record(z.string().max(LIMITS.LIST_ITEM_MAX), z.number().min(0).max(100))
                                 .refine((o) => Object.keys(o).length <= LIMITS.LIST_MAX, "too many scores")
                                 .default({})
                                 .transform((scores) =>
                                   Object.fromEntries(
                                     Object.entries(scores).filter(([k]) =>
                                       (LEADERBOARD_CATEGORY_KEYS as readonly string[]).includes(k),
                                     ),
                                   ),
                                 ),
      wholesaleCostInputPerM:  z.number().min(0).max(100_000).default(0),
      wholesaleCostOutputPerM: z.number().min(0).max(100_000).default(0),
      rateLimitPerUserDaily:   z.number().int().positive().max(1_000_000).optional(),
      // Admin-authored behavior rules for this model, layered under the
      // platform-wide base prompt at request time (see
      // history-compaction.service.ts's buildSystemPrompt in the chat
      // gateway service). NOT the removed per-conversation systemPrompt —
      // that was fully user-controlled and no longer exists at all.
      systemPrompt:            z.string().max(20_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(models)
        .set({
          displayName:             input.displayName,
          displayNameAr:           input.displayNameAr,
          badge:                   input.badge ?? "",
          providerIconKey:         input.providerIconKey ?? null,
          tier:                    input.tier,
          markupMultiplier:        String(input.markupMultiplier),
          contextWindow:           input.contextWindow,
          maxOutputTokens:         input.maxOutputTokens,
          supportsVision:          input.supportsVision,
          categories:              input.categories,
          categoryScores:          input.categoryScores,
          wholesaleCostInputPerM:  String(input.wholesaleCostInputPerM),
          wholesaleCostOutputPerM: String(input.wholesaleCostOutputPerM),
          rateLimitPerUserDaily:   input.rateLimitPerUserDaily ?? null,
          systemPrompt:            input.systemPrompt ?? null,
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
    .input(z.object({ modelId: modelIdSchema, isAvailable: z.boolean() }))
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
