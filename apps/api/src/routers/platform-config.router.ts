import { router, adminProcedure } from "./trpc";
import { z } from "zod";
import { db, platformConfig, PLATFORM_CONFIG_ID } from "@ai-platform/db";
import { eq } from "drizzle-orm";

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
});
