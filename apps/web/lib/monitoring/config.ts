/**
 * apps/web/lib/monitoring/config.ts (Phase 9.2b)
 *
 * PURE helpers for error monitoring — deliberately no `@sentry/*` import so
 * vitest can load this file and so a bug here can never take the SDK down
 * with it. Everything that decides WHAT leaves the browser/server lives here:
 *
 *   - isMonitoringEnabled: no DSN ⇒ monitoring is fully off (CI, e2e, local).
 *   - shouldIgnoreError:   expected/user-caused failures never become issues.
 *   - scrubEvent:          strips cookies, auth headers, request bodies,
 *                          query strings, emails, bearer tokens and redeem-code
 *                          shaped strings before an event is sent.
 *   - beforeSend:          the Sentry hook that applies the two above.
 *
 * Privacy contract (mirrors docs/legal/PRIVACY_POLICY.md §3): no message
 * content, no cookies, no request bodies. Chat prompts are never captured
 * because bodies are dropped and Session Replay is not enabled.
 */

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null;
}

/** DSN is public by design (NEXT_PUBLIC_*). Unset/malformed ⇒ monitoring off. */
export function isMonitoringEnabled(dsn: string | undefined | null): boolean {
  if (typeof dsn !== "string" || dsn.trim() === "") return false;
  try {
    return new URL(dsn.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Redaction ────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
// Redeem code SHAPE (packages/config constants): 4×4 groups, alphabet
// ABCDEFGHJKMNPQRSTUVWXYZ23456789. Shape only — the checksum stays server-side.
const REDEEM_CODE_RE = /\b[A-HJKMNP-Z2-9]{4}(?:-[A-HJKMNP-Z2-9]{4}){3}\b/g;

export function redactText(text: string): string {
  return text
    .replace(BEARER_RE, "Bearer [redacted]")
    .replace(EMAIL_RE, "[email]")
    .replace(REDEEM_CODE_RE, "[code]");
}

/** Drops the query string and hash (`?next=…`, `?ref=…`, tokens). */
export function scrubUrl(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
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
    // Stop button / navigation away: not a failure.
    if (error.name === "AbortError") return true;

    // Next.js control-flow "errors" (redirect(), notFound()).
    const digest = error.digest;
    if (
      typeof digest === "string" &&
      /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/.test(digest)
    ) {
      return true;
    }

    // tRPC client/server errors carry `data.code`.
    const data = error.data;
    if (isObject(data) && typeof data.code === "string" && IGNORED_TRPC_CODES.has(data.code)) {
      return true;
    }
  }

  const message = messageOf(error);
  if (message === "NEXT_REDIRECT" || message === "NEXT_NOT_FOUND") return true;
  if (NETWORK_MESSAGE_RE.test(message)) return true; // user offline / flaky network
  if (RESIZE_OBSERVER_RE.test(message)) return true; // benign browser noise
  return false;
}

/** tRPC query keys look like [["billing","getBalance"], {input,type}].
 * Returns "billing.getBalance" — the procedure path only, never the input. */
export function procedureFromKey(queryKey: readonly unknown[] | undefined): string | undefined {
  const first = queryKey?.[0];
  if (Array.isArray(first) && first.length > 0 && first.every((p) => typeof p === "string")) {
    return first.join(".");
  }
  return undefined;
}

// ─── Scrubber ─────────────────────────────────────────────────────────

const HEADER_ALLOWLIST = new Set(["user-agent", "accept-language", "content-type"]);

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

/**
 * Mutates and returns the event. Generic so it type-checks against Sentry's
 * ErrorEvent without importing it.
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

  const exception = e.exception;
  if (isObject(exception) && Array.isArray(exception.values)) {
    for (const v of exception.values) {
      if (isObject(v) && typeof v.value === "string") v.value = redactText(v.value);
    }
  }

  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs.forEach(scrubBreadcrumb);

  return event;
}

/** Sentry `beforeSend`: drop expected errors, scrub the rest. */
export function beforeSend<T>(event: T, hint?: { originalException?: unknown }): T | null {
  if (hint && shouldIgnoreError(hint.originalException)) return null;
  return scrubEvent(event);
}

/** One env var for both runtimes; set to "preview" on Vercel Preview. */
export function monitoringEnvironment(): string {
  return process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production";
}
