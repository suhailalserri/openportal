import { describe, it, expect, vi, beforeEach } from "vitest";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}));
vi.mock("@sentry/node", () => sdk);

const DSN = "https://abc@o1.ingest.sentry.io/2";

async function load() {
  vi.resetModules();
  const sentry = await import("./sentry");
  const hook = await import("./error-hook");
  return { sentry, hook };
}

describe("initSentry", () => {
  beforeEach(() => {
    sdk.init.mockReset();
    sdk.captureException.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does nothing without a DSN: SDK untouched, no sink registered", async () => {
    const { sentry, hook } = await load();
    expect(sentry.initSentry({})).toBe(false);
    expect(sentry.initSentry({ SENTRY_DSN: "" })).toBe(false);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(hook.hasErrorSink()).toBe(false);
    expect(sentry.isSentryEnabled()).toBe(false);
  });

  it("a malformed DSN turns monitoring off with a warning; it never throws", async () => {
    const { sentry } = await load();
    expect(sentry.initSentry({ SENTRY_DSN: "not a url" })).toBe(false);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("initialises errors-only with the privacy options and the deployed SHA as release", async () => {
    const { sentry, hook } = await load();
    expect(sentry.initSentry({ SENTRY_DSN: DSN, RENDER_GIT_COMMIT: "deadbeef", NODE_ENV: "production" })).toBe(true);
    const opts = sdk.init.mock.calls[0]?.[0];
    expect(opts.dsn).toBe(DSN);
    expect(opts.release).toBe("deadbeef");
    expect(opts.environment).toBe("production");
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.maxBreadcrumbs).toBe(0);
    expect(opts.tracesSampleRate).toBeUndefined();
    expect(opts.initialScope.tags.service).toBe("api");
    expect(opts.beforeBreadcrumb({})).toBeNull();
    expect(hook.hasErrorSink()).toBe(true);
  });

  it("wires the scrubber: an event passed to the SDK's beforeSend is scrubbed", async () => {
    const { sentry } = await load();
    sentry.initSentry({ SENTRY_DSN: DSN });
    const { beforeSend } = sdk.init.mock.calls[0]?.[0];
    const out = beforeSend(
      { message: "x@y.co", request: { headers: { authorization: "Bearer SECRET" }, data: { content: "PROMPT" } } },
      { originalException: new Error("boom") }
    );
    const json = JSON.stringify(out);
    expect(json).not.toContain("SECRET");
    expect(json).not.toContain("PROMPT");
    expect(json).not.toContain("x@y.co");
  });

  it("drops the SDK's own unhandled-rejection integration (we install one policy)", async () => {
    const { sentry } = await load();
    sentry.initSentry({ SENTRY_DSN: DSN });
    const { integrations } = sdk.init.mock.calls[0]?.[0];
    const kept = integrations([{ name: "OnUnhandledRejection" }, { name: "Http" }]);
    expect(kept.map((i: { name: string }) => i.name)).toEqual(["Http"]);
  });

  it("an SDK that throws during init leaves monitoring off and the api up", async () => {
    sdk.init.mockImplementationOnce(() => {
      throw new Error("sdk broke");
    });
    const { sentry, hook } = await load();
    expect(sentry.initSentry({ SENTRY_DSN: DSN })).toBe(false);
    expect(hook.hasErrorSink()).toBe(false);
  });
});

describe("captureApiError (via the sink)", () => {
  beforeEach(() => {
    sdk.init.mockReset();
    sdk.captureException.mockReset();
  });

  it("thrown error -> captureException with tags", async () => {
    const { sentry, hook } = await load();
    sentry.initSentry({ SENTRY_DSN: DSN });
    const err = new Error("boom");
    hook.reportError(err, { tags: { source: "trpc", procedure: "billing.x" } });
    expect(sdk.captureException).toHaveBeenCalledWith(err, { tags: { source: "trpc", procedure: "billing.x" } });
  });

  it("a throwing SDK never propagates to the caller", async () => {
    const { sentry, hook } = await load();
    sentry.initSentry({ SENTRY_DSN: DSN });
    sdk.captureException.mockImplementation(() => {
      throw new Error("transport down");
    });
    expect(() => hook.reportError(new Error("x"))).not.toThrow();
    expect(() => sentry.captureApiError(new Error("x"))).not.toThrow();
  });

  it("is a no-op when disabled", async () => {
    const { sentry } = await load();
    sentry.captureApiError(new Error("x"));
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
});
