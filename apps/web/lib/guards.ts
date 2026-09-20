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

/**
 * (auth) group (login/register/verify/forgot/reset), Phase 3.1.
 *
 * Signed-in visitor → bounced to /{locale}/chat, so a stale/still-open
 * login tab can't be used to re-run signup/reset flows while already
 * authenticated (and a signed-in user landing on /auth/login would
 * otherwise just sit on a form that errors when submitted).
 *
 * Deliberately does NOT try to preserve `next` here the way
 * decideAppGuard/decideAdminGuard do: the (auth) route GROUP layout
 * (app/[locale]/(auth)/auth/layout.tsx) has no `searchParams` — only a
 * `page.tsx` receives that in the App Router — so there is no `next` to
 * read at this layer without restructuring where the guard runs. Landing
 * on an auth page while already signed in is an edge case (stale tab,
 * back-button after login), not the common path, so losing `next` in
 * that specific case is an accepted trade-off rather than a bug; the
 * common "signed-out user hits a protected page" path (decideAppGuard)
 * still preserves it correctly. `verify` is NOT exempt: a signed-in user
 * has nothing to do there either (emailVerified is already true, or
 * `afterEmailVerification` already flipped status to active — see
 * lib/auth.ts).
 */
export function decideAuthGuard({ locale, session }: Pick<GuardInput, "locale" | "session">): GuardDecision {
  if (isSignedIn(session)) {
    return { action: "redirect", to: `/${resolveLocale(locale)}/chat` };
  }
  return { action: "allow" };
}
