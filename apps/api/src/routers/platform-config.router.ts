import { router, adminProcedure } from "./trpc";
import { z } from "zod";
import { db, platformConfig, auditLogs, PLATFORM_CONFIG_ID } from "@ai-platform/db";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { MICRO_CREDIT } from "@ai-platform/config";
import {
  checkWelcomeBonusForEmail, getWelcomeBonusAdminView, updateWelcomeBonusConfig,
} from "../services/welcome-bonus.service";
import { getFeatureFlags, updateFeatureFlags } from "../services/feature-flags.service";

/**
 * apps/api/src/routers/platform-config.router.ts
 *
 * Admin-only access to the single platform-wide base system prompt row
 * (packages/db/src/schema/platform-config.ts). This is one layer of the
 * two-layer server-owned system prompt — the other is each model's own
 * `models.systemPrompt` (see models.router.ts's `publish` mutation) — both
 * assembled together at request time in
 * apps/api/src/services/history-compaction.service.ts's buildSystemPrompt.
 *
 * Deliberately its own tiny router rather than folded into modelsRouter:
 * this setting is platform-scoped, not per-model, and the underlying table
 * is its own singleton row rather than a models column.
 */
export const platformConfigRouter = router({
  get: adminProcedure.query(async () => {
    const row = await db.query.platformConfig.findFirst({
      where: eq(platformConfig.id, PLATFORM_CONFIG_ID),
    });
    // The seed row from migration 0014 should always exist, but a fresh
    // dev DB that skipped the migration's INSERT (or ran it before this
    // router existed) shouldn't 500 an admin just for loading the settings
    // page — treat "no row yet" the same as "row exists, prompt unset".
    return { basePrompt: row?.basePrompt ?? "" };
  }),

  update: adminProcedure
    .input(z.object({
      // Mirrors models.router.ts's per-model systemPrompt cap — same
      // reasoning, same limit, kept consistent rather than picking a
      // different number for no real reason.
      basePrompt: z.string().max(20_000),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(platformConfig)
        .values({
          id:               PLATFORM_CONFIG_ID,
          basePrompt:       input.basePrompt || null,
          updatedByAdminId: ctx.user.id,
        })
        .onConflictDoUpdate({
          target: platformConfig.id,
          set: {
            basePrompt:       input.basePrompt || null,
            updatedAt:        new Date(),
            updatedByAdminId: ctx.user.id,
          },
        });
      return { success: true };
    }),

  // ── Welcome bonus (ADR-010) ───────────────────────────────────────────
  // Amount is entered/shown in whole display credits by the admin and
  // stored as micro-credits. Capped so a typo can't mint a fortune.
  getWelcomeBonus: adminProcedure.query(async () => {
    const v = await getWelcomeBonusAdminView();
    return {
      enabled:      v.enabled,
      amountCredits: v.amountMicroCredits / MICRO_CREDIT,
      launchedAt:   v.launchedAt,
      claimedCount: v.claimedCount,
    };
  }),

  // Read-only "why can't this account claim?" lookup for the admin page.
  checkWelcomeBonusUser: adminProcedure
    .input(z.object({ email: z.string().trim().min(3).max(255) }))
    .query(({ input }) => checkWelcomeBonusForEmail(input.email)),

  updateWelcomeBonus: adminProcedure
    .input(z.object({
      enabled:       z.boolean(),
      amountCredits: z.number().min(0).max(100_000).multipleOf(0.01),
    }))
    .mutation(async ({ ctx, input }) => {
      const amountMicroCredits = Math.round(input.amountCredits * MICRO_CREDIT);
      const result = await updateWelcomeBonusConfig({
        enabled: input.enabled, amountMicroCredits, adminId: ctx.user.id,
      }).catch((err: unknown) => {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Invalid welcome bonus settings",
        });
      });
      await db.insert(auditLogs).values({
        adminId:    ctx.user.id,
        action:     "welcome_bonus.update",
        targetType: "platform_config",
        targetId:   PLATFORM_CONFIG_ID,
        before:     { enabled: result.before.enabled, amountMicroCredits: result.before.amountMicroCredits },
        after:      { enabled: result.after.enabled,  amountMicroCredits: result.after.amountMicroCredits },
        ip:         ctx.ip,
      });
      return { success: true };
    }),

  // ── Feature switches (P6.3d) ──────────────────────────────────────────
  // Attachments, voice input and the structured stream ("thinking"). All OFF until an admin turns
  // one on; on means on for EVERY user. The user-facing read is `user.features`.
  getFeatures: adminProcedure.query(() => getFeatureFlags()),

  updateFeatures: adminProcedure
    .input(z.object({
      attachments: z.boolean(),
      voice:       z.boolean(),
      thinking:    z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { before, after } = await updateFeatureFlags(input, ctx.user.id);
      await db.insert(auditLogs).values({
        adminId:    ctx.user.id,
        action:     "features.update",
        targetType: "platform_config",
        targetId:   PLATFORM_CONFIG_ID,
        before,
        after,
        ip:         ctx.ip,
      });
      return after;
    }),
});
