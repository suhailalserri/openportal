import { initTRPC, TRPCError } from "@trpc/server";
import type { inferAsyncReturnType } from "@trpc/server";
import type { FastifyRequest, FastifyReply } from "fastify";
import { db, users, sessions } from "@ai-platform/db";
import { eq, and, gt } from "drizzle-orm";

// ── Context ───────────────────────────────────────────────────────────

// Deliberately does NOT rely on `req.cookies` (only present because
// @fastify/cookie's plugin registration in index.ts augments FastifyRequest
// — a file outside this router's import graph, see rate-limiter.ts's
// comment for the same class of issue). Parsing the raw header directly
// keeps this file's typing correct regardless of which program compiles it.
function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function createContext({
  req,
}: {
  req: FastifyRequest;
  res: FastifyReply;
}) {
  async function getUser() {
    const cookie    = parseCookie(req.headers.cookie, "better-auth.session_token")
                   ?? req.headers["authorization"]?.replace("Bearer ", "");
    if (!cookie) return null;

    // better-auth's session cookie value is the session's `token`, not its
    // `id` — `id` is an internal row identifier better-auth never puts in
    // the cookie. Looking this up by `id` (as before) could never match.
    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.token, cookie),
        gt(sessions.expiresAt, new Date())
      ),
    });
    if (!session) return null;

    return db.query.users.findFirst({ where: eq(users.id, session.userId) });
  }

  // A plain string, not the raw Fastify request — this is what makes
  // Context safe to satisfy from apps/web's Next.js context too (see
  // apps/web/server/context.ts). Putting FastifyRequest itself in Context
  // meant apps/web's `createContext` could never structurally match it
  // (Next.js has no FastifyRequest), and meant this whole file's types had
  // to be resolved by Next.js's build in the first place — the root cause
  // of the build failures this file's git history is fixing.
  const ip = (req.headers["cf-connecting-ip"] as string)
          ?? (req.headers["x-forwarded-for"] as string)
          ?? req.ip
          ?? "unknown";

  return { db, user: await getUser(), ip };
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
