/**
 * packages/config/src/monitoring-scrub.ts (plan P2.1)
 *
 * THE single scrubbing list for error monitoring. Used by:
 *   - apps/web/lib/monitoring/config.ts  (re-exports these; browser + Vercel)
 *   - apps/api/src/monitoring/options.ts (Fastify on Render)
 *
 * PURE on purpose: no `@sentry/*` import, no Node API, no env read. That is
 * what lets vitest load it, lets the browser bundle it, and means a bug here
 * can never take an SDK down with it. Exposed as the subpath export
 * `@ai-platform/config/monitoring-scrub` (NOT via the package root, so the
 * browser bundle does not pull in the model catalogue).
 *
 * Privacy contract (docs/legal/PRIVACY_POLICY.md §3): no message content, no
 * cookies, no request bodies, no emails, no credentials leave the process.
 */

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null;
}

// ─── Redaction ────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
// Redeem code SHAPE (packages/config constants): 4×4 groups, alphabet
// ABCDEFGHJKMNPQRSTUVWXYZ23456789. Shape only — the checksum stays server-side.
const REDEEM_CODE_RE = /\b[A-HJKMNP-Z2-9]{4}(?:-[A-HJKMNP-Z2-9]{4}){3}\b/g;
// Our own key formats (sk-aip-…, sk-aip-admin-…) and common provider keys.
const API_KEY_RE = /\b(?:sk-aip-admin-|sk-aip-|sk-ant-|sk-or-|sk-)[A-Za-z0-9_-]{16,}\b/g;

// bcrypt digests (users.apiKeyHash, password hashes): $2a$12$ + 53 chars.
const BCRYPT_RE = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g;

export function redactText(text: string): string {
  return text
    .replace(BEARER_RE, "Bearer [redacted]")
    .replace(BCRYPT_RE, "[hash]")
    .replace(API_KEY_RE, "[key]")
    .replace(EMAIL_RE, "[email]")
    .replace(REDEEM_CODE_RE, "[code]");
}

/** Drops the query string and hash (`?next=…`, `?ref=…`, tokens). */
export function scrubUrl(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

/**
 * Object KEYS whose values are never sent, at any depth (substring, case
 * insensitive). Deliberately broad: over-redacting a diagnostic field is
 * cheap, leaking a credential or a prompt is not.
 */
export const SENSITIVE_KEY_RE =
  /authorization|cookie|password|passwd|secret|token|api[-_]?key|hash|email|content|messages|prompt|body|redeem|credential|session/i;

const MAX_DEPTH = 6;
export const REDACTED = "[redacted]";

/** Recursively redacts sensitive keys and secret-shaped strings. Returns a copy. */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactText(value);
  if (depth >= MAX_DEPTH) return isObject(value) ? REDACTED : value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (isObject(value)) {
    const out: Loose = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? REDACTED : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

// ─── Ignore list ──────────────────────────────────────────────────────

/** Expected tRPC outcomes: the UI already handles them; not bugs. */
export const IGNORED_TRPC_CODES: ReadonlySet<string> = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "BAD_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "UNPROCESSABLE_CONTENT",
  "TOO_MANY_REQUESTS",
  "CLIENT_CLOSED_REQUEST",
]);

const NETWORK_MESSAGE_RE =
  /^(failed to fetch|networkerror|load failed|network request failed|the network connection was lost)/i;
const RESIZE_OBSERVER_RE = /^ResizeObserver loop/i;

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (isObject(error) && typeof error.message === "string") return error.message;
  return "";
}

export function shouldIgnoreError(error: unknown): boolean {
  if (isObject(error)) {
    // Stop button / navigation away / client disconnect: not a failure.
    if (error.name === "AbortError") return true;

    // Next.js control-flow "errors" (redirect(), notFound()).
    const digest = error.digest;
    if (
      typeof digest === "string" &&
      /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/.test(digest)
    ) {
      return true;
    }

    // tRPC client errors carry `data.code`; server-side TRPCError carries `code`.
    const data = error.data;
    if (isObject(data) && typeof data.code === "string" && IGNORED_TRPC_CODES.has(data.code)) {
      return true;
    }
    if (typeof error.code === "string" && IGNORED_TRPC_CODES.has(error.code)) return true;
  }

  const message = messageOf(error);
  if (message === "NEXT_REDIRECT" || message === "NEXT_NOT_FOUND") return true;
  if (NETWORK_MESSAGE_RE.test(message)) return true; // user offline / flaky network
  if (RESIZE_OBSERVER_RE.test(message)) return true; // benign browser noise
  return false;
}

// ─── Scrubber ─────────────────────────────────────────────────────────

const HEADER_ALLOWLIST = new Set(["user-agent", "accept-language", "content-type"]);
/** Exception messages can echo request text (upstream error bodies). Cap them. */
const MAX_EXCEPTION_VALUE = 500;

function scrubBreadcrumb(crumb: unknown): void {
  if (!isObject(crumb)) return;
  if (typeof crumb.message === "string") crumb.message = redactText(crumb.message);
  const data = crumb.data;
  if (isObject(data)) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = scrubUrl(data[key] as string);
    }
    delete data.arguments; // console.* breadcrumbs carry raw arguments
    delete data.body;
  }
}

function scrubExceptionValue(v: unknown): void {
  if (!isObject(v)) return;
  if (typeof v.value === "string") {
    const redacted = redactText(v.value);
    v.value =
      redacted.length > MAX_EXCEPTION_VALUE
        ? `${redacted.slice(0, MAX_EXCEPTION_VALUE)}…[truncated]`
        : redacted;
  }
  // Local variables captured per stack frame can hold anything.
  const st = v.stacktrace;
  if (isObject(st) && Array.isArray(st.frames)) {
    for (const frame of st.frames) if (isObject(frame)) delete frame.vars;
  }
}

/**
 * Mutates and returns the event. Generic so it type-checks against Sentry's
 * ErrorEvent without importing it. Only touches keys that are present, so a
 * sparse event stays sparse.
 */
export function scrubEvent<T>(event: T): T {
  if (!isObject(event)) return event;
  const e = event as Loose;

  if (isObject(e.request)) {
    const req = e.request;
    if (typeof req.url === "string") req.url = scrubUrl(req.url);
    delete req.cookies;
    delete req.data;
    delete req.query_string;
    delete req.env; // Node SDK: REMOTE_ADDR etc.
    if (isObject(req.headers)) {
      const kept: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (HEADER_ALLOWLIST.has(name.toLowerCase())) kept[name] = value;
      }
      req.headers = kept;
    }
  }

  if (isObject(e.user)) {
    const id = e.user.id;
    if (typeof id === "string" || typeof id === "number") e.user = { id: String(id) };
    else delete e.user;
  }

  if (typeof e.message === "string") e.message = redactText(e.message);
  if (isObject(e.logentry) && typeof e.logentry.message === "string") {
    e.logentry.message = redactText(e.logentry.message);
  }

  // `extra` is free-form (Sentry puts non-Error throwables and captured
  // objects here). Never sent.
  delete e.extra;

  if (isObject(e.contexts)) e.contexts = redactDeep(e.contexts);
  if (isObject(e.tags)) e.tags = redactDeep(e.tags);

  const exception = e.exception;
  if (isObject(exception) && Array.isArray(exception.values)) {
    for (const v of exception.values) scrubExceptionValue(v);
  }

  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs.forEach(scrubBreadcrumb);

  return event;
}
