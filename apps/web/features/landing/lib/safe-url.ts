/**
 * apps/web/features/landing/lib/safe-url.ts
 *
 * Phase 3.3. `payment_methods.logo_url` is free text an admin typed (or
 * pasted) into a form. It is about to become an <img src> on the PUBLIC
 * homepage, so it is treated as untrusted (Rule 7's spirit: nothing
 * admin- or model-authored is rendered on trust).
 *
 * Accepts ONLY:
 *   - an absolute http(s) URL, or
 *   - a same-origin path starting with a single "/" (e.g. /logos/jaib.svg)
 * and returns null for everything else — `javascript:`, `data:`,
 * `vbscript:`, `file:`, protocol-relative `//host/x` (which would let an
 * admin typo point at any host), backslash tricks, control characters,
 * empty strings and non-strings.
 *
 * Pure (no DOM, no `URL` global needed beyond Node's) so
 * safe-url.test.ts runs in plain node.
 */

const MAX_LENGTH = 2048;

// Any ASCII control character or whitespace inside the value. Browsers
// strip tabs/newlines when parsing URLs, which is how "java\tscript:" and
// similar bypasses work — reject them outright instead of trying to
// reason about what a browser would do with them.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u0020\u007f]/;

export function safeLogoUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value === "" || value.length > MAX_LENGTH) return null;
  if (FORBIDDEN_CHARS.test(value)) return null;
  if (value.includes("\\")) return null;

  // Same-origin path: exactly one leading slash. "//host" is
  // protocol-relative (cross-origin) and is rejected here.
  if (value.startsWith("/")) {
    return value.startsWith("//") ? null : value;
  }

  // The WHATWG parser (and every browser) treats ANY run of slashes after
  // "http(s):" as "//", so "https:///cdn.example.com/x.png" silently
  // becomes host "cdn.example.com" — and "https:///a.png" becomes host
  // "a.png". A typo could therefore load from a host the admin never
  // meant. Require exactly two slashes and a non-slash next character in
  // the RAW text, so what the admin typed is what the browser will use.
  if (!/^https?:\/\/[^/]/i.test(value)) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  // A hostname is required ("https:///x" and "https:x" parse oddly).
  if (parsed.hostname === "") return null;
  return parsed.toString();
}
