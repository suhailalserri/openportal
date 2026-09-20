import { db } from "@ai-platform/db";
import { appRouter, createCallerFactory, type Context } from "@ai-platform/api/routers";

/**
 * apps/web/lib/trpc-server.ts
 *
 * Phase 3.2 (docs/FRONTEND_REBUILD_PLAN.md). Replaces the earlier draft
 * of this session's landing-page data access (a hand-written mirror of
 * modelsRouter.list / billingRouter.listPackages directly against
 * @ai-platform/db) with a REAL tRPC server caller, per direct
 * instruction: no query logic is duplicated here — every field, filter,
 * and shape a Server Component sees is whatever the actual router
 * returns, today and after any future change to it.
 *
 * Backend addition this required (additive, non-breaking, documented in
 * docs/frontend/BRANCH_AND_CI_NOTES.md): apps/api/src/routers/trpc.ts now
 * exports `createCallerFactory` (t.createCallerFactory, a stock tRPC v11
 * API) and its `Context` type; routers/index.ts re-exports both alongside
 * the existing `appRouter`/`AppRouter`. Nothing about the Fastify server
 * or the existing Next.js HTTP tRPC handler (server/router.ts, frozen)
 * changed — this only adds a second, in-process way to invoke the same
 * procedures tRPC already serves over HTTP.
 *
 * `"server-only"` package is NOT used here (checked: not a declared
 * dependency anywhere in this repo, and no file in this codebase imports
 * it — lib/session.ts, the closest analogous case, relies on a doc
 * comment instead: "Server components only... importing ./auth pulls in
 * the database client"). Rather than add an unverified new dependency,
 * this file follows that exact existing convention: Server Component-only
 * by contract and comment, not by an enforced import-time guard. Do not
 * import this file from a Client Component — it opens a DB connection at
 * module load (via @ai-platform/db) and would pull the DB client into
 * the client bundle.
 *
 * WHY A SYNTHETIC CONTEXT, NOT apps/web/server/context.ts: that file
 * (frozen) builds a context from a real `Request`'s cookies/headers —
 * correct for the Next.js tRPC *HTTP route handler*, which always has a
 * real incoming request. A Server Component rendering the public landing
 * page has no request to read a session cookie from in the same sense
 * (Next.js's `headers()` reflects the current navigation's request, but
 * every procedure this file calls is `publicProcedure` — user/session is
 * irrelevant to their behavior either way). `user: null` here is not a
 * stand-in for "figure out who's signed in" — it is the deliberate,
 * correct value: these calls are always anonymous reads, so asserting
 * that honestly is more correct than plumbing a session through for
 * procedures that never branch on it. If a future page needs a
 * SIGNED-IN caller (reading `ctx.user`), it must build its own context
 * from lib/session.ts's getServerSession() — this file's `publicCaller`
 * must not be reused for that; a protectedProcedure call through this
 * context would always throw UNAUTHORIZED, by design.
 */
const publicContext: Context = {
  db,
  user: null,
  ip: "server",
};

const createCaller = createCallerFactory(appRouter);

/**
 * A tRPC caller scoped to anonymous, public-only reads. Only call
 * `publicProcedure` routes through this (models.list,
 * billing.listPackages, billing.listPaymentMethods) — anything under a
 * `protectedProcedure`/`adminProcedure` will throw UNAUTHORIZED, since
 * `user` is always null here.
 */
export const publicCaller = createCaller(publicContext);
