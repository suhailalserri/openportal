import { router, publicProcedure, adminProcedure } from "./trpc";
import { z }            from "zod";
import { MODEL_CATALOG } from "@ai-platform/config";

export const modelsRouter = router({

  list: publicProcedure.query(() => {
    return MODEL_CATALOG.filter(m => m.isAvailable).map(m => ({
      id:               m.id,
      displayName:      m.displayName,
      displayNameAr:    m.displayNameAr,
      badge:            m.badge,
      tier:             m.tier,
      contextWindow:    m.contextWindow,
      maxOutputTokens:  m.maxOutputTokens,
      supportsVision:   m.supportsVision,
      creditsPerKInput:  m.creditsPerKInput,
      creditsPerKOutput: m.creditsPerKOutput,
    }));
  }),

  listAll: adminProcedure.query(() => MODEL_CATALOG),

  toggleAvailability: adminProcedure
    .input(z.object({ modelId: z.string(), isAvailable: z.boolean() }))
    .mutation(({ input }) => {
      const model = MODEL_CATALOG.find(m => m.id === input.modelId);
      if (!model) throw new Error("Model not found");
      model.isAvailable = input.isAvailable;
      return { success: true };
    }),
});
