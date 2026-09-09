import { initTRPC, TRPCError } from "@trpc/server";
import type { inferAsyncReturnType } from "@trpc/server";
import type { FastifyRequest, FastifyReply } from "fastify";
import { db, users, sessions } from "@ai-platform/db";
import { eq, and, gt } from "drizzle-orm";

// ── Context ───────────────────────────────────────────────────────────
export async function createContext({
  req,
  res,
}: {
  req: FastifyRequest;
  res: FastifyReply;
}) {
  async function getUser() {
    const cookie    = req.cookies?.["better-auth.session_token"]
                   ?? req.headers["authorization"]?.replace("Bearer ", "");
    if (!cookie) return null;

    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, cookie),
        gt(sessions.expiresAt, new Date())
      ),
    });
    if (!session) return null;

    return db.query.users.findFirst({ where: eq(users.id, session.userId) });
  }

  return { req, res, db, user: await getUser() };
}

export type Context = inferAsyncReturnType<typeof createContext>;

// ── tRPC init ─────────────────────────────────────────────────────────
const t = initTRPC.context<Context>().create();

export const router          = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin")
    throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
