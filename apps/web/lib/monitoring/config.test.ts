import { describe, it, expect } from "vitest";

import {
  beforeSend,
  isMonitoringEnabled,
  procedureFromKey,
  redactText,
  scrubEvent,
  scrubUrl,
  shouldIgnoreError,
} from "./config";

/**
 * apps/web/lib/monitoring/config.test.ts (Phase 9.2b)
 *
 * The scrubber is the privacy guarantee for what reaches a third party, so
 * it is tested against realistic event shapes rather than mocked.
 */
describe("isMonitoringEnabled", () => {
  it("is off without a usable https DSN", () => {
    for (const dsn of [undefined, null, "", "   ", "not a url", "http://k@host/1"]) {
      expect(isMonitoringEnabled(dsn as string | undefined)).toBe(false);
    }
  });
  it("is on for an https DSN", () => {
    expect(isMonitoringEnabled("https://abc@o123.ingest.sentry.io/456")).toBe(true);
  });
});

describe("scrubUrl / redactText", () => {
  it("drops query string and hash", () => {
    expect(scrubUrl("https://x.test/ar/auth/login?next=/ar/chat&ref=ABC#top")).toBe(
      "https://x.test/ar/auth/login"
    );
    expect(scrubUrl("/ar/chat")).toBe("/ar/chat");
  });
  it("redacts emails, bearer tokens and redeem-code-shaped strings", () => {
    const out = redactText("user a.b+c@example.com sent Bearer abc.def-123 for ABCD-EFGH-JKMN-PQRS");
    expect(out).not.toContain("example.com");
    expect(out).not.toContain("abc.def-123");
    expect(out).not.toContain("ABCD-EFGH");
    expect(out).toContain("[email]");
    expect(out).toContain("Bearer [redacted]");
    expect(out).toContain("[code]");
  });
  it("does not touch ordinary text or codes with excluded characters", () => {
    expect(redactText("Cannot read properties of undefined")).toBe(
      "Cannot read properties of undefined"
    );
    // I, L, O, 0, 1 are outside the redeem alphabet
    expect(redactText("ABCI-EFGH-JKMN-PQRS")).toBe("ABCI-EFGH-JKMN-PQRS");
  });
});

describe("shouldIgnoreError", () => {
  it("ignores aborts, Next control flow and network drops", () => {
    expect(shouldIgnoreError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(shouldIgnoreError(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;replace" }))).toBe(true);
    expect(shouldIgnoreError(new Error("NEXT_NOT_FOUND"))).toBe(true);
    expect(shouldIgnoreError(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldIgnoreError(new TypeError("Load failed"))).toBe(true);
    expect(shouldIgnoreError(new Error("ResizeObserver loop completed with undelivered notifications."))).toBe(true);
  });
  it("ignores expected tRPC codes but not server faults", () => {
    const trpc = (code: string) => Object.assign(new Error("boom"), { data: { code } });
    for (const code of ["UNAUTHORIZED", "FORBIDDEN", "BAD_REQUEST", "NOT_FOUND", "TOO_MANY_REQUESTS"]) {
      expect(shouldIgnoreError(trpc(code))).toBe(true);
    }
    expect(shouldIgnoreError(trpc("INTERNAL_SERVER_ERROR"))).toBe(false);
    expect(shouldIgnoreError(trpc("PARSE_ERROR"))).toBe(false);
  });
  it("keeps real bugs, including non-Error throws", () => {
    expect(shouldIgnoreError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(shouldIgnoreError("something odd")).toBe(false);
    expect(shouldIgnoreError(undefined)).toBe(false);
    expect(shouldIgnoreError(null)).toBe(false);
  });
});

describe("procedureFromKey", () => {
  it("returns the procedure path and never the input", () => {
    expect(procedureFromKey([["billing", "getBalance"], { input: { email: "a@b.co" }, type: "query" }])).toBe(
      "billing.getBalance"
    );
  });
  it("returns undefined for unknown shapes", () => {
    expect(procedureFromKey(undefined)).toBeUndefined();
    expect(procedureFromKey([])).toBeUndefined();
    expect(procedureFromKey(["plain"])).toBeUndefined();
    expect(procedureFromKey([[]])).toBeUndefined();
  });
});

describe("scrubEvent", () => {
  const makeEvent = () => ({
    message: "Failed for jane@example.com",
    request: {
      url: "https://x.test/en/billing?ref=SECRET#a",
      cookies: { "better-auth.session_token": "s3cr3t" },
      data: { messages: [{ role: "user", content: "my private prompt" }] },
      query_string: "next=/x",
      headers: {
        Cookie: "better-auth.session_token=s3cr3t",
        Authorization: "Bearer key",
        "x-turnstile-token": "tok",
        "User-Agent": "UA",
        "Accept-Language": "ar",
      },
    },
    user: { id: 42, email: "jane@example.com", ip_address: "1.2.3.4", username: "jane" },
    exception: { values: [{ type: "Error", value: "code ABCD-EFGH-JKMN-PQRS invalid" }] },
    breadcrumbs: [
      { category: "console", message: "hi bob@example.com", data: { arguments: ["secret"] } },
      { category: "fetch", data: { url: "/api/redeem?x=1", body: "code=1" } },
      { category: "navigation", data: { from: "/a?b=1", to: "/c?d=2" } },
    ],
  });

  it("strips secrets from request, user, exception and breadcrumbs", () => {
    const e = scrubEvent(makeEvent());
    const json = JSON.stringify(e);
    for (const leak of ["s3cr3t", "my private prompt", "jane@example.com", "1.2.3.4", "Bearer key", "tok", "SECRET", "ABCD-EFGH", "bob@example.com", "secret", "code=1", "next=/x"]) {
      expect(json).not.toContain(leak);
    }
    expect(e.request.url).toBe("https://x.test/en/billing");
    expect(Object.keys(e.request.headers).sort()).toEqual(["Accept-Language", "User-Agent"]);
    expect(e.user).toEqual({ id: "42" });
    expect(e.breadcrumbs[1]?.data).toEqual({ url: "/api/redeem" });
    expect(e.breadcrumbs[2]?.data).toEqual({ from: "/a", to: "/c" });
  });

  it("removes a user object that has no id", () => {
    const e = scrubEvent({ user: { email: "a@b.co" } }) as { user?: unknown };
    expect(e.user).toBeUndefined();
  });

  it("tolerates sparse and non-object events", () => {
    expect(scrubEvent({})).toEqual({});
    expect(scrubEvent(null)).toBeNull();
    expect(scrubEvent("x")).toBe("x");
  });
});

describe("beforeSend", () => {
  it("drops ignored errors and scrubs the rest", () => {
    expect(beforeSend({ message: "x" }, { originalException: new TypeError("Failed to fetch") })).toBeNull();
    const kept = beforeSend({ request: { url: "/a?b=1" } }, { originalException: new Error("real bug") });
    expect(kept).toEqual({ request: { url: "/a" } });
  });
  it("works without a hint", () => {
    expect(beforeSend({ message: "x@y.co" })).toEqual({ message: "[email]" });
  });
});
