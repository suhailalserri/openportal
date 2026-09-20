/**
 * Post-login redirect safety (Phase 2.1, FRONTEND_REBUILD_PLAN.md §6).
 *
 * The `?next=` query parameter is attacker-controllable: a phishing link
 * such as /ar/auth/login?next=https://evil.example would, if followed
 * blindly after sign-in, send a freshly-authenticated user to a
 * look-alike site. sanitizeNext() is the single gate every `next` value
 * must pass before it is used in a redirect (server or client).
 *
 * Accepted: same-origin paths that start with a supported locale
 * segment (`/ar/…` or `/en/…`). Everything else → null.
 *
 * Pure module — no imports — so vitest can load it without the `@/` alias.
 */

export const SUPPORTED_LOCALES = ["ar", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "ar";

const NEXT_MAX_LENGTH = 2048;
// C0 controls + DEL. The WHATWG URL parser silently STRIPS tab/CR/LF, so
// "/\t/evil.com" would otherwise become "//evil.com" after parsing.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const LOCALE_PREFIX = /^\/(ar|en)\//;
// /ar/auth, /ar/auth/login … but not /ar/authors. Redirecting back into
// the auth pages after login would loop (or bounce off a signed-in guard).
const AUTH_ROUTE = /^\/(ar|en)\/auth(\/|$)/;
// Never used for navigation — only lets URL() resolve dot-segments and
// tell us whether the result stayed on the same origin.
const PROBE_ORIGIN = "http://sanitize-next.invalid";

export function resolveLocale(locale: unknown): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale as string)
    ? (locale as SupportedLocale)
    : DEFAULT_LOCALE;
}

function isAuthRoute(pathname: string): boolean {
  if (AUTH_ROUTE.test(pathname)) return true;
  try {
    // "/ar/%61uth/login" decodes to "/ar/auth/login".
    return AUTH_ROUTE.test(decodeURIComponent(pathname));
  } catch {
    return true; // malformed escape sequence → fail closed
  }
}

/**
 * Returns a safe in-app path (`/{locale}/…` + query) or null.
 * The URL fragment is dropped: it never reaches the server, and the
 * value is used for server redirects.
 */
export function sanitizeNext(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (next.length === 0 || next.length > NEXT_MAX_LENGTH) return null;
  if (CONTROL_CHARS.test(next) || next.includes("\\")) return null;

  // Raw check first: rejects "//evil.com", "https://…", "javascript:…",
  // "/fr/…", and anything not starting with a supported locale.
  if (!LOCALE_PREFIX.test(next)) return null;

  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;

  // Re-check after normalisation: "/ar/../evil" resolves to "/evil".
  if (!LOCALE_PREFIX.test(url.pathname)) return null;
  if (isAuthRoute(url.pathname)) return null;

  return `${url.pathname}${url.search}`;
}

/** `/{locale}/auth/login`, plus `?next=` when the original path is safe. */
export function buildLoginRedirect(locale: string, requestPath?: string | null): string {
  const base = `/${resolveLocale(locale)}/auth/login`;
  const safe = sanitizeNext(requestPath);
  return safe ? `${base}?next=${encodeURIComponent(safe)}` : base;
}

/**
 * Where to send the user after a successful login (used by 3.1):
 * the sanitized `next`, else the app home.
 */
export function resolvePostLoginTarget(next: unknown, locale: string): string {
  return sanitizeNext(next) ?? `/${resolveLocale(locale)}/chat`;
}
