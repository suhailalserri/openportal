import { z }                   from "zod";
import { router, protectedProcedure } from "./trpc";
import { TRPCError }           from "@trpc/server";
import { db, users, balances } from "@ai-platform/db";
import { eq }                  from "drizzle-orm";
import bcrypt                  from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { checkLimit }          from "../utils/rate-limiter";
import { FRAUD }               from "@ai-platform/config";

function assertNotRateLimited(userId: string, action: string) {
  const allowed = checkLimit(`sensitive:${action}:${userId}`, FRAUD.SENSITIVE_ACTION_PER_HOUR, 60 * 60_000);
  if (!allowed) {
    throw new TRPCError({
      code:    "TOO_MANY_REQUESTS",
      message: "محاولات كثيرة جداً. حاول مرة أخرى لاحقاً.",
    });
  }
}

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
        .set({
          updatedAt: new Date(),
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.locale      !== undefined ? { locale: input.locale } : {}),
        })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword:     z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      assertNotRateLimited(ctx.user.id, "changePassword");

      if (!ctx.user.passwordHash) {
        throw new TRPCError({
          code:    "BAD_REQUEST",
          message: "This account signed up via a social provider and has no password to change.",
        });
      }

      const isValid = await bcrypt.compare(input.currentPassword, ctx.user.passwordHash);
      if (!isValid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
      }
      const newHash = await bcrypt.hash(input.newPassword, 12);
      await db.update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  // NOTE: API keys are hashed with SHA-256, NOT bcrypt. auth.middleware.ts
  // authenticates Bearer API keys by hashing the presented raw key with
  // SHA-256 and doing a direct equality lookup against `users.apiKeyHash`
  // (`eq(users.apiKeyHash, keyHash)`). That only works because SHA-256 is
  // deterministic. bcrypt is salted/non-deterministic and can never be
  // looked up this way — using it here silently breaks all API-key auth
  // (every request 401s, since the stored hash can never match a fresh
  // lookup hash). bcrypt is correct for passwordHash above (verified via
  // compare, never looked up by value); it is wrong for apiKeyHash.
  generateApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    assertNotRateLimited(ctx.user.id, "generateApiKey");

    const rawKey   = `sk-aip-${randomBytes(36).toString("hex")}`;
    const keyHash  = createHash("sha256").update(rawKey).digest("hex");
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
