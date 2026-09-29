import { z }                   from "zod";
import { router, protectedProcedure } from "./trpc";
import { TRPCError }           from "@trpc/server";
import { db, users, balances } from "@ai-platform/db";
import { eq }                  from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { checkRateLimit }       from "../utils/redis-rate-limiter";
import { FRAUD }               from "@ai-platform/config";
import { getReferralStats }    from "../services/referral.service";
import {
  claimWelcomeBonus, getWelcomeBonusStatus, WelcomeBonusError,
  type WelcomeBonusErrorCode,
} from "../services/welcome-bonus.service";

async function assertNotRateLimited(userId: string, action: string) {
  // P3.1: Redis-backed (shared across replicas); falls back per-process if Redis is down.
  const { allowed } = await checkRateLimit(`sensitive:${action}:${userId}`, FRAUD.SENSITIVE_ACTION_PER_HOUR, 60 * 60_000);
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

  // Password changes are NOT handled here. This tRPC service (apps/api)
  // authenticates requests by reading the `sessions` table directly — it
  // has no access to the better-auth server instance, which lives in
  // apps/web (apps/web/lib/auth.ts) and is the only thing that knows how
  // to correctly verify/rewrite a credential. A previous version of this
  // mutation compared against `ctx.user.passwordHash`, but better-auth's
  // email/password strategy never writes there — it stores the hash on
  // `accounts.password` (providerId "credential"); see the comment on
  // `users.passwordHash` in packages/db/src/schema/users.ts. That made
  // this endpoint fail for every real password-auth user (`passwordHash`
  // is always null), or worse, silently check against a stale value if a
  // row somehow had one. The Settings page now calls
  // `authClient.changePassword()` directly, which hits better-auth's own
  // `/api/auth/change-password` route in apps/web and updates the correct
  // column with the correct hasher.

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
    await assertNotRateLimited(ctx.user.id, "generateApiKey");

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

  // Referral program (decisions.md ADR-009). Code is generated at signup
  // (apps/web/lib/auth.ts); this just surfaces it + how it's performed.
  getReferralStats: protectedProcedure.query(({ ctx }) => getReferralStats(ctx.user.id)),

  // Welcome bonus (decisions.md ADR-010). `eligible` is the only flag the
  // UI needs to decide whether to show the floating card / billing button.
  getWelcomeBonus: protectedProcedure.query(({ ctx }) => getWelcomeBonusStatus(ctx.user.id)),

  // Once-only is enforced in the service by an atomic conditional UPDATE
  // (see welcome-bonus.service.ts), NOT here — the rate limit below is only
  // abuse protection against hammering the endpoint.
  claimWelcomeBonus: protectedProcedure.mutation(async ({ ctx }) => {
    await assertNotRateLimited(ctx.user.id, "claimWelcomeBonus");
    try {
      const res = await claimWelcomeBonus(ctx.user.id);
      return { success: true as const, ...res };
    } catch (err) {
      if (err instanceof WelcomeBonusError) {
        const map: Record<WelcomeBonusErrorCode, "CONFLICT" | "FORBIDDEN" | "PRECONDITION_FAILED"> = {
          ALREADY_CLAIMED:    "CONFLICT",
          ACCOUNT_RESTRICTED: "FORBIDDEN",
          DISABLED:           "PRECONDITION_FAILED",
          NOT_ELIGIBLE:       "PRECONDITION_FAILED",
        };
        // `message` carries the stable code so the client can translate it.
        throw new TRPCError({ code: map[err.code], message: err.code });
      }
      throw err;
    }
  }),
});
