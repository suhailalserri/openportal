import { initTRPC, TRPCError } from "@trpc/server";
import type { inferAsyncReturnType } from "@trpc/server";
import type { FastifyRequest, FastifyReply } from "fastify";
import { db, users, sessions } from "@ai-platform/db";
import { eq, and, gt } from "drizzle-orm";
import { assertUsableAccount, ACCOUNT_ERROR_CODE } from "../utils/account-guard";

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

/**
 * Additive export (Phase 3.2 backend addition, docs/FRONTEND_REBUILD_PLAN.md
 * — see docs/frontend/BRANCH_AND_CI_NOTES.md for the full rationale).
 *
 * Lets any consumer of appRouter build a server-side "caller" — invoke a
 * procedure as a plain async function, in-process, with no HTTP
 * round-trip and no Fastify request object required. This is what lets
 * a Next.js Server Component (apps/web/lib/trpc-server.ts) call
 * `models.list` / `billing.listPackages` directly instead of either (a)
 * duplicating each router's query logic by hand, or (b) fetching its own
 * /api/trpc route over HTTP from the server (a needless loopback).
 *
 * Purely additive: nothing above this line changes, `router` and
 * `publicProcedure`/`protectedProcedure`/`adminProcedure` keep their
 * existing behavior for the Fastify server and the Next.js HTTP tRPC
 * handler exactly as before. This only adds a second way to invoke the
 * same procedures.
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * P1.1 / L14 — the guard lives HERE, in the procedures, not in either entry
 * point. apps/web/server/context.ts feeds this same appRouter, so guarding the
 * procedures covers the Fastify handler and the Next.js handler/caller alike.
 * The user row in `ctx` is read fresh from the DB on every request by both
 * `createContext` implementations, so a status change takes effect on the
 * very next call (no session cache involved on this path).
 *
 * The message is a stable code (`ACCOUNT_SUSPENDED` / `ACCOUNT_UNDER_REVIEW`)
 * the frontend maps to copy; do not reword.
 */
function requireUsableAccount<U extends { status: string; isFraudFlagged: boolean }>(user: U): void {
  const guard = assertUsableAccount(user);
  if (!guard.ok) {
    throw new TRPCError({ code: "FORBIDDEN", message: ACCOUNT_ERROR_CODE[guard.reason] });
  }
}

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  requireUsableAccount(ctx.user);
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  // Role check first: a non-admin learns nothing about their own account
  // state from an admin endpoint. An admin who is suspended/flagged is
  // locked out of admin too.
  if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin")
    throw new TRPCError({ code: "FORBIDDEN" });
  requireUsableAccount(ctx.user);
  return next({ ctx: { ...ctx, user: ctx.user } });
});
