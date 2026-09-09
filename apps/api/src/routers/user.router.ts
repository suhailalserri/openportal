import { z }                   from "zod";
import { router, protectedProcedure } from "./trpc";
import { TRPCError }           from "@trpc/server";
import { db, users, balances } from "@ai-platform/db";
import { eq }                  from "drizzle-orm";
import { hashSync }            from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";

export const userRouter = router({

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const { passwordHash, apiKeyHash, twoFactorSecret, ...safe } = ctx.user;
    return safe;
  }),

  updateProfile: protectedProcedure
    .input(z.object({
      displayName: z.string().min(1).max(100).optional(),
      locale:      z.enum(["ar", "en"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.update(users)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword:     z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const { compareSync } = await import("bcryptjs");
      if (!compareSync(input.currentPassword, ctx.user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
      }
      await db.update(users)
        .set({ passwordHash: hashSync(input.newPassword, 12), updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  generateApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const rawKey   = `sk-aip-${randomBytes(36).toString("hex")}`;
    const keyHash  = hashSync(rawKey, 12);
    const prefix   = rawKey.slice(0, 14) + "...";
    await db.update(users)
      .set({ apiKeyHash: keyHash, apiKeyPrefix: prefix, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.id));
    return { key: rawKey, prefix };
  }),

  revokeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    await db.update(users)
      .set({ apiKeyHash: null, apiKeyPrefix: null, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.id));
    return { success: true };
  }),

  getApiKeyInfo: protectedProcedure.query(async ({ ctx }) => {
    return { prefix: ctx.user.apiKeyPrefix ?? null, hasKey: !!ctx.user.apiKeyHash };
  }),
});
