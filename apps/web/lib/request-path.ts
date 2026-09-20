/**
 * Name of the header apps/web/middleware.ts uses to hand the current
 * request's path (+ query string) to server components.
 *
 * Why it exists (Phase 2.1): a server layout cannot see the URL it is
 * rendering — `params` only carries dynamic segments — so the (app) and
 * (admin) guards had no source for `?next=`. Middleware is the one place
 * that sees the full request URL, so it forwards it here.
 *
 * Deliberately a tiny dependency-free module: middleware.test.ts imports
 * this constant to prove the header name in middleware.ts and the name
 * lib/session.ts reads can never drift apart.
 *
 * Treat the value as UNTRUSTED input. It only ever reaches a redirect
 * through sanitizeNext() (lib/safe-redirect.ts).
 */
export const REQUEST_PATH_HEADER = "x-pathname";
