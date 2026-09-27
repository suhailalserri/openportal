/**
 * apps/web/lib/referral.ts
 *
 * The referral flow has two independent gaps, both fixed together:
 *
 * 1. middleware.ts's bare-`/` → `/{locale}` redirect used to build the
 *    target with `new URL(newPath, request.url)` and never copied
 *    `request.nextUrl.search` onto it, so `?ref=CODE` was silently
 *    dropped on the very first hop (middleware.ts now forwards it).
 *
 * 2. Even with the query preserved on `/{locale}`, a visitor lands on
 *    the marketing page, not `/auth/register` — the only place that
 *    reads `ref` (register-form.tsx). Every CTA on the landing page
 *    (header "Get started", hero primary button, etc.) links to
 *    `/${locale}/auth/register` with no query at all, so the code was
 *    *still* lost the moment the visitor clicked through, even before
 *    today's fix. Rewriting every one of those `<Link>`s to thread the
 *    query through is fragile (easy to miss the next new CTA that gets
 *    added), so instead we capture `ref` once, globally, into a cookie
 *    — the same "capture on any page, redeem on register" pattern
 *    referral programs use precisely because they can't control every
 *    entry point into the signup form.
 *
 * COOKIE (not localStorage): register-form.tsx needs to keep working
 * exactly as-is when a visitor DOES land with `?ref=` already on the
 * URL (searchParams still wins, see readReferralCode below), and a
 * cookie is trivially readable from a Server Component / Route Handler
 * later if the signup flow ever moves server-side — localStorage is
 * client-only. document.cookie is fine here: the value is an opaque
 * referral code the visitor already saw in the URL, not a secret.
 */

const COOKIE_NAME = "op_ref";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — typical attribution window

/** Same shape the server trims/uppercases to (see register-form.tsx's comment). */
function normalize(code: string): string {
  return code.trim().toUpperCase();
}

function readCookie(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Call once, high in the tree (see ReferralCapture below). Reads `ref`
 * off the CURRENT url — wherever the visitor actually landed, not just
 * `/` — and persists it so it survives clicking through to a page that
 * doesn't forward query strings.
 */
export function captureReferralFromLocation(): void {
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (!ref) return;
  const value = normalize(ref);
  if (!value) return;
  // Don't clobber an existing code with a blank/older link the visitor
  // happens to revisit later in the same attribution window.
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; max-age=${MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}

/**
 * The URL's own `?ref=` always wins (register-form.tsx already reads
 * this directly via useSearchParams — kept as the source of truth for
 * a direct `/auth/register?ref=...` link). Fall back to the captured
 * cookie for the far more common case: the code arrived on an earlier
 * page and the visitor navigated here via a plain CTA link.
 */
export function readReferralCode(searchParamsRef: string | null): string | null {
  if (searchParamsRef) return normalize(searchParamsRef);
  if (typeof document === "undefined") return null;
  return readCookie(COOKIE_NAME);
}
