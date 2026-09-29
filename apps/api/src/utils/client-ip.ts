/**
 * Client-IP resolution (plan P1.3, closes G10). One shared, dependency-free
 * module so the api (Fastify + tRPC) and the web app never grow their own
 * copy of "which header do I believe". Pure on purpose (no Fastify, no DB,
 * no node: imports) for the same reason as ./account-guard.ts: apps/web
 * imports it, and it may be bundled by Next.
 *
 * TRUST RULES (each one is covered by client-ip.test.ts):
 *
 * api side  (`resolveApiClientIp`)
 *   1. `X-Client-IP` is believed ONLY when the request authenticated with the
 *      internal service token (`internalAuth`). Anyone else can send the
 *      header; it is ignored.
 *   2. `cf-connecting-ip` is believed only when `trustCfConnectingIp` is on
 *      (default on: Render's edge is Cloudflare, seen as `server: cloudflare`
 *      + `cf-ray` in P0.1, and Cloudflare overwrites a client-supplied value).
 *      Kill switch: env TRUST_CF_CONNECTING_IP=false.
 *   3. Otherwise `requestIp`, which is Fastify's `request.ip`. With the
 *      `trustProxy` hop count from `trustedProxyHopsFromEnv()` that is the
 *      address appended by the nearest trusted proxy, never a value the
 *      caller prepended to X-Forwarded-For.
 *   4. `x-forwarded-for` is never read directly on the api.
 *
 * web side  (`resolveWebClientIp`)
 *   On Vercel, x-vercel-forwarded-for / x-real-ip / x-forwarded-for are set
 *   by Vercel and cannot be forged by the caller (Vercel docs, "Request
 *   headers"). `cf-connecting-ip` is never read: there is no Cloudflare in
 *   front of Vercel here, so any value is attacker-supplied.
 *   Off Vercel (local dev, CI/E2E) only x-forwarded-for / x-real-ip are
 *   read, so tests can pick an identity; that is not safe on a self-hosted
 *   deployment that is not behind a proxy you control.
 */

export type HeaderBag = Record<string, string | string[] | undefined>;

const IPV4_OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_RE = new RegExp(`^${IPV4_OCTET}(?:\\.${IPV4_OCTET}){3}$`);

function isIPv4(s: string): boolean {
  return IPV4_RE.test(s);
}

function isIPv6(s: string): boolean {
  if (s.length < 2 || s.length > 45 || !/^[0-9a-f:.]+$/i.test(s)) return false;
  const halves = s.split("::");
  if (halves.length > 2) return false;
  const groups = (part: string): number => {
    if (part === "") return 0;
    const segs = part.split(":");
    let n = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (i === segs.length - 1 && seg.includes(".")) {
        if (!isIPv4(seg)) return -1;
        n += 2;
      } else if (/^[0-9a-f]{1,4}$/i.test(seg)) {
        n += 1;
      } else {
        return -1;
      }
    }
    return n;
  };
  const a = groups(halves[0]!);
  const b = halves.length === 2 ? groups(halves[1]!) : 0;
  if (a < 0 || b < 0) return false;
  return halves.length === 2 ? a + b <= 7 : a === 8;
}

/** Validates ONE address. Returns a normalised value, or undefined. */
export function parseIp(raw: string | string[] | null | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;
  const s = value.trim().toLowerCase();
  if (s === "" || s.length > 45) return undefined;
  if (s.startsWith("::ffff:")) {
    const rest = s.slice(7);
    if (isIPv4(rest)) return rest;
  }
  if (isIPv4(s) || isIPv6(s)) return s;
  return undefined;
}

function firstListEntry(raw: string | string[] | null | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;
  return value.split(",")[0]?.trim();
}

function header(headers: HeaderBag, name: string): string | string[] | undefined {
  return headers[name];
}

/** Length-first, then constant-time-ish compare; no node:crypto (see header). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True only for `Authorization: Bearer <INTERNAL_SERVICE_TOKEN>`. */
export function isInternalTokenAuth(
  authorization: string | string[] | undefined,
  internalToken: string | undefined,
): boolean {
  if (!internalToken || typeof authorization !== "string") return false;
  return safeEqual(authorization, `Bearer ${internalToken}`);
}

export interface ApiClientIpInput {
  headers: HeaderBag;
  /** Fastify `request.ip` (already trustProxy-aware). */
  requestIp?: string | undefined;
  /** True only when the request carried the internal service token. */
  internalAuth: boolean;
  trustCfConnectingIp: boolean;
}

export function resolveApiClientIp(input: ApiClientIpInput): string {
  if (input.internalAuth) {
    const forwarded = parseIp(header(input.headers, "x-client-ip"));
    if (forwarded) return forwarded;
  }
  if (input.trustCfConnectingIp) {
    const cf = parseIp(header(input.headers, "cf-connecting-ip"));
    if (cf) return cf;
  }
  return parseIp(input.requestIp) ?? "unknown";
}

/** env TRUST_CF_CONNECTING_IP: anything but the literal "false" means on. */
export function trustCfConnectingIpFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return env.TRUST_CF_CONNECTING_IP !== "false";
}

/** env TRUSTED_PROXY_HOPS: integer 0..5, default 1; 0 disables trustProxy. */
export function trustedProxyHopsFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}

export interface WebClientIpOptions {
  /** Defaults to `process.env.VERCEL === "1"`. Test seam. */
  onVercel?: boolean;
}

export function resolveWebClientIp(
  get: (name: string) => string | null | undefined,
  options: WebClientIpOptions = {},
): string | undefined {
  const onVercel =
    options.onVercel ?? (typeof process !== "undefined" && process.env?.VERCEL === "1");
  const xff = parseIp(firstListEntry(get("x-forwarded-for")));
  const realIp = parseIp(get("x-real-ip"));
  if (onVercel) {
    return parseIp(firstListEntry(get("x-vercel-forwarded-for"))) ?? realIp ?? xff;
  }
  return xff ?? realIp;
}
