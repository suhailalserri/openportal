import { describe, it, expect } from "vitest";
import {
  apiBeforeSend,
  normalizeDsn,
  resolveEnvironment,
  resolveRelease,
} from "./options";
import { redactDeep, redactText, scrubEvent } from "@ai-platform/config/monitoring-scrub";

/**
 * P2.1 — what leaves the api process. The scrubber is the privacy guarantee,
 * so it is tested against a realistic Node-SDK event shape, not mocks.
 */

const BCRYPT = "$2a$12$" + "a".repeat(53);

function leakyEvent() {
  return {
    message: "Failed for jane@example.com",
    server_name: "srv-abc",
    request: {
      url: "https://api.test/chat?token=SECRETQUERY#frag",
      method: "POST",
      query_string: "token=SECRETQUERY",
      cookies: { "better-auth.session_token": "SESSIONCOOKIE" },
      data: { messages: [{ role: "user", content: "MY PRIVATE PROMPT" }] },
      env: { REMOTE_ADDR: "9.9.9.9" },
      headers: {
        cookie: "better-auth.session_token=SESSIONCOOKIE",
        authorization: "Bearer BEARERSECRET",
        "x-client-ip": "9.9.9.9",
        "user-agent": "UA",
        "content-type": "application/json",
      },
    },
    user: { id: "u-1", email: "jane@example.com", ip_address: "9.9.9.9" },
    extra: { messages: [{ content: "EXTRA PROMPT" }], apiKeyHash: BCRYPT },
    contexts: {
      runtime: { name: "node", version: "20.0.0" },
      custom: { authorization: "Bearer CTXSECRET", nested: { password: "PW", note: "ok" } },
    },
    tags: { source: "trpc", procedure: "billing.redeem", apiKeyHash: BCRYPT },
    exception: {
      values: [
        {
          type: "Error",
          value:
            "upstream said: key sk-aip-" + "A1b2C3d4E5f6G7h8I9j0" + " for jane@example.com code ABCD-EFGH-JKMN-PQRS " + BCRYPT,
          stacktrace: { frames: [{ function: "f", vars: { prompt: "FRAME VARS" } }] },
        },
        { type: "Error", value: "x".repeat(2000) },
      ],
    },
    breadcrumbs: [{ category: "console", message: "hi bob@example.com", data: { arguments: ["ARGSECRET"] } }],
  };
}

const LEAKS = [
  "jane@example.com", "bob@example.com", "SECRETQUERY", "SESSIONCOOKIE", "MY PRIVATE PROMPT",
  "9.9.9.9", "BEARERSECRET", "EXTRA PROMPT", BCRYPT, "CTXSECRET", "PW", "FRAME VARS",
  "A1b2C3d4E5f6G7h8I9j0", "ABCD-EFGH-JKMN-PQRS", "ARGSECRET",
];

describe("scrubbing (shared list)", () => {
  it("removes every sensitive value from a realistic event", () => {
    const out = scrubEvent(leakyEvent());
    const json = JSON.stringify(out);
    for (const leak of LEAKS) expect(json, `leaked: ${leak}`).not.toContain(leak);
  });

  it("keeps the diagnostics we actually need", () => {
    const out = scrubEvent(leakyEvent()) as ReturnType<typeof leakyEvent>;
    expect(out.request.url).toBe("https://api.test/chat");
    expect(out.request.method).toBe("POST");
    expect(Object.keys(out.request.headers).sort()).toEqual(["content-type", "user-agent"]);
    expect(out.user).toEqual({ id: "u-1" });
    expect(out.tags.procedure).toBe("billing.redeem");
    expect(out.contexts.runtime).toEqual({ name: "node", version: "20.0.0" });
    expect(out.exception.values[0]?.type).toBe("Error");
  });

  it("caps exception messages so an echoed request body cannot ride along", () => {
    const out = scrubEvent(leakyEvent()) as ReturnType<typeof leakyEvent>;
    const long = out.exception.values[1]?.value ?? "";
    expect(long.length).toBeLessThan(600);
    expect(long).toContain("[truncated]");
  });

  it("redactDeep redacts by key at any depth and by shape in strings", () => {
    const out = redactDeep({ a: { b: { apiKey: "K", fine: "keep", list: [{ token: "T" }] } }, s: "x@y.co" }) as any;
    expect(out.a.b.apiKey).toBe("[redacted]");
    expect(out.a.b.fine).toBe("keep");
    expect(out.a.b.list[0].token).toBe("[redacted]");
    expect(out.s).toBe("[email]");
  });

  it("redactText handles our key formats and bcrypt hashes", () => {
    expect(redactText("k=sk-aip-admin-" + "Z".repeat(30))).toContain("[key]");
    expect(redactText(BCRYPT)).toBe("[hash]");
    expect(redactText("Cannot read properties of undefined")).toBe("Cannot read properties of undefined");
  });

  it("does not add keys to a sparse event", () => {
    expect(scrubEvent({})).toEqual({});
    expect(scrubEvent(null)).toBeNull();
  });
});

describe("apiBeforeSend", () => {
  it("drops expected errors (tRPC codes, aborts) and keeps real bugs", () => {
    const trpc = (code: string) => Object.assign(new Error("x"), { code });
    for (const code of ["UNAUTHORIZED", "FORBIDDEN", "BAD_REQUEST", "NOT_FOUND", "TOO_MANY_REQUESTS", "CONFLICT"]) {
      expect(apiBeforeSend({ message: "m" }, { originalException: trpc(code) })).toBeNull();
    }
    expect(apiBeforeSend({ message: "m" }, { originalException: Object.assign(new Error("x"), { name: "AbortError" }) })).toBeNull();
    expect(apiBeforeSend({ message: "m" }, { originalException: trpc("INTERNAL_SERVER_ERROR") })).not.toBeNull();
    expect(apiBeforeSend({ message: "m" }, { originalException: new TypeError("real bug") })).not.toBeNull();
  });

  it("scrubs what it keeps", () => {
    const out = apiBeforeSend(leakyEvent(), { originalException: new Error("boom") });
    const json = JSON.stringify(out);
    for (const leak of LEAKS) expect(json).not.toContain(leak);
  });

  it("FAILS CLOSED: if scrubbing throws, the event is dropped, never sent raw", () => {
    const evil = {};
    Object.defineProperty(evil, "request", {
      enumerable: true,
      get() {
        throw new Error("getter exploded");
      },
    });
    expect(apiBeforeSend(evil, { originalException: new Error("boom") })).toBeNull();
  });
});

describe("normalizeDsn / release / environment", () => {
  it("is off for unset, blank, malformed and non-https DSNs (never throws)", () => {
    for (const v of [undefined, null, "", "   ", "not a url", "http://k@host/1"]) {
      expect(normalizeDsn(v as string | undefined)).toBeUndefined();
    }
    expect(normalizeDsn(" https://abc@o1.ingest.sentry.io/2 ")).toBe("https://abc@o1.ingest.sentry.io/2");
  });

  it("release prefers SENTRY_RELEASE, then Render's commit SHA, then GITHUB_SHA", () => {
    expect(resolveRelease({ SENTRY_RELEASE: "r1", RENDER_GIT_COMMIT: "abc" })).toBe("r1");
    expect(resolveRelease({ RENDER_GIT_COMMIT: "abc123" })).toBe("abc123");
    expect(resolveRelease({ GITHUB_SHA: "g1" })).toBe("g1");
    expect(resolveRelease({})).toBeUndefined();
    expect(resolveRelease({ RENDER_GIT_COMMIT: "  " })).toBeUndefined();
  });

  it("environment falls back to NODE_ENV then production", () => {
    expect(resolveEnvironment({ SENTRY_ENVIRONMENT: "preview", NODE_ENV: "production" })).toBe("preview");
    expect(resolveEnvironment({ NODE_ENV: "development" })).toBe("development");
    expect(resolveEnvironment({})).toBe("production");
  });
});
