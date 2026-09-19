/**
 * Route-guard DECISIONS as pure functions (Phase 2.1).
 *
 * The (app) and (admin) server layouts fetch the session and call these;
 * the layouts then act on the result (`redirect(to)`). Keeping the
 * decision pure means every branch is unit-tested without a running
 * server, a database or a session cookie (guards.test.ts).
 *
 * Rule 4 (FRONTEND_REBUILD_PLAN.md §3): server layouts guard; client
 * checks are UX only. These decisions gate rendering of the shell, they
 * do not replace the role checks inside `admin.*` procedures.
 *
 * Relative imports only — this file is loaded by vitest, which has no
 * `@/` alias configured.
 */
import { isAdminRole } from "./roles";
import { buildLoginRedirect, resolveLocale } from "./safe-redirect";

/**
 * Structural stand-in for better-auth's session. `user` is typed as a
 * bare `object` on purpose: the real session type is assignable to it
 * whatever fields the auth config declares, and the role is read
 * defensively in getSessionRole().
 */
export type SessionLike = { user?: object | null } | null | undefined;

export type GuardDecision =
  | { action: "allow" }
  | { action: "redirect"; to: string };

export interface GuardInput {
  locale: string;
  session: SessionLike;
  /** Path + query of the request, from middleware's x-pathname header. */
  requestPath?: string | null | undefined;
}

export function getSessionRole(session: SessionLike): string | null {
  const user = session?.user as { role?: unknown } | null | undefined;
  return typeof user?.role === "string" ? user.role : null;
}

function isSignedIn(session: SessionLike): boolean {
  return Boolean(session && session.user);
}

/** (app) group: any signed-in user. Signed-out → login (with ?next=). */
export function decideAppGuard({ locale, session, requestPath }: GuardInput): GuardDecision {
  if (!isSignedIn(session)) {
    return { action: "redirect", to: buildLoginRedirect(locale, requestPath) };
  }
  return { action: "allow" };
}

/**
 * (admin) group: admin | superadmin only.
 * Signed-out → login (with ?next=). Signed-in non-admin → the app home,
 * NOT login: once 3.1 exists, sending a signed-in user to login would
 * bounce them straight back and loop.
 */
export function decideAdminGuard({ locale, session, requestPath }: GuardInput): GuardDecision {
  if (!isSignedIn(session)) {
    return { action: "redirect", to: buildLoginRedirect(locale, requestPath) };
  }
  if (!isAdminRole(getSessionRole(session))) {
    return { action: "redirect", to: `/${resolveLocale(locale)}/chat` };
  }
  return { action: "allow" };
}
