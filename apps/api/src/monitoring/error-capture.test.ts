import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { initTRPC, TRPCError } from "@trpc/server";
import { setErrorSink, reportError, hasErrorSink } from "./error-hook";
import { reportTrpcError } from "./trpc-error";
import { registerFastifyErrorReporting } from "./fastify-errors";
import { attachWorkerErrorReporting } from "./worker-errors";
import { handleUnhandledRejection, installProcessErrorHandlers } from "./process-handlers";
import { isAuthorizedSmokeTest, smokeTestError } from "./smoke-test";

/**
 * P2.1 — the capture points. Real Fastify + real tRPC plugin (no index.ts
 * import: it listens on a port at import time), sink replaced by a spy.
 */
const sink = vi.fn();

beforeEach(() => {
  sink.mockReset();
  setErrorSink(sink);
});
afterEach(() => {
  setErrorSink(null);
  vi.restoreAllMocks();
});

describe("error-hook", () => {
  it("is a no-op without a sink and never throws, even if the sink does", () => {
    setErrorSink(null);
    expect(hasErrorSink()).toBe(false);
    expect(() => reportError(new Error("x"))).not.toThrow();
    setErrorSink(() => {
      throw new Error("sink exploded");
    });
    expect(() => reportError(new Error("x"))).not.toThrow();
  });
});

describe("tRPC onError (real Fastify tRPC plugin)", () => {
  const t = initTRPC.create();
  const router = t.router({
    boom: t.procedure.query(() => {
      throw new Error("db exploded");
    }),
    forbidden: t.procedure.query(() => {
      throw new TRPCError({ code: "FORBIDDEN", message: "ACCOUNT_SUSPENDED" });
    }),
    unauthorized: t.procedure.query(() => {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }),
    ok: t.procedure.query(() => "fine"),
  });

  async function build() {
    const app = Fastify();
    await app.register(fastifyTRPCPlugin, {
      prefix: "/trpc",
      trpcOptions: { router, createContext: () => ({}), onError: reportTrpcError },
    });
    return app;
  }

  it("a thrown server error is reported once, as the ORIGINAL error, tagged with the procedure", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/trpc/boom" });
    expect(res.statusCode).toBe(500);
    expect(sink).toHaveBeenCalledTimes(1);
    const [err, ctx] = sink.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("db exploded");
    expect(ctx).toEqual({ tags: { source: "trpc", procedure: "boom" } });
    await app.close();
  });

  it("expected outcomes (FORBIDDEN, UNAUTHORIZED) and successes are NOT reported", async () => {
    const app = await build();
    expect((await app.inject({ method: "GET", url: "/trpc/forbidden" })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/trpc/unauthorized" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/trpc/ok" })).statusCode).toBe(200);
    expect(sink).not.toHaveBeenCalled();
    await app.close();
  });

  it("never forwards procedure input to the sink", async () => {
    const app = await build();
    const input = encodeURIComponent(JSON.stringify({ email: "victim@example.com" }));
    await app.inject({ method: "GET", url: `/trpc/boom?input=${input}` });
    expect(JSON.stringify(sink.mock.calls)).not.toContain("victim@example.com");
    await app.close();
  });
});

describe("Fastify onError hook (routes outside tRPC: /chat, /health, ...)", () => {
  async function build() {
    const app = Fastify();
    registerFastifyErrorReporting(app);
    app.get("/boom", async () => {
      throw new Error("route exploded");
    });
    app.get("/u/:id", async () => {
      throw new Error("param route exploded");
    });
    app.get("/bad", async () => {
      throw Object.assign(new Error("validation"), { statusCode: 400 });
    });
    app.get("/abort", async () => {
      throw Object.assign(new Error("client left"), { name: "AbortError" });
    });
    app.get("/ok", async () => "fine");
    return app;
  }

  it("reports an unhandled route error and still answers 500", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]![1]).toEqual({ tags: { source: "fastify", route: "/boom", method: "GET" } });
    await app.close();
  });

  it("tags the route PATTERN, never the raw URL (URLs can carry secrets)", async () => {
    const app = await build();
    await app.inject({ method: "GET", url: "/u/super-secret-token-123" });
    expect(sink.mock.calls[0]![1].tags.route).toBe("/u/:id");
    expect(JSON.stringify(sink.mock.calls[0]![1])).not.toContain("super-secret-token-123");
    await app.close();
  });

  it("ignores client errors (<500), aborts and healthy requests", async () => {
    const app = await build();
    await app.inject({ method: "GET", url: "/bad" });
    await app.inject({ method: "GET", url: "/abort" });
    await app.inject({ method: "GET", url: "/ok" });
    expect(sink).not.toHaveBeenCalled();
    await app.close();
  });

  it("a throwing sink cannot change the response", async () => {
    setErrorSink(() => {
      throw new Error("sink exploded");
    });
    const app = await build();
    expect((await app.inject({ method: "GET", url: "/boom" })).statusCode).toBe(500);
    await app.close();
  });
});

describe("BullMQ worker failed events", () => {
  it("reports the error with queue/job/attempt and never reads job.data", () => {
    let handler: ((job: unknown, err: Error) => void) | undefined;
    const worker = { on: (ev: string, fn: typeof handler) => void (ev === "failed" && (handler = fn)) };
    attachWorkerErrorReporting(worker, "email");
    const job = { name: "verification", attemptsMade: 2, data: { to: "victim@example.com" } };
    handler!(job, new Error("smtp down"));
    handler!(undefined, new Error("stalled"));
    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls[0]![1]).toEqual({
      tags: { source: "worker", queue: "email", job: "verification", attempt: "2" },
    });
    expect(sink.mock.calls[1]![1].tags.job).toBe("unknown");
    expect(JSON.stringify(sink.mock.calls)).not.toContain("victim@example.com");
  });
});

describe("unhandled rejections: log, report, keep running", () => {
  it("reports Errors and wraps non-Error reasons", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    handleUnhandledRejection(new Error("stray"));
    handleUnhandledRejection("just a string");
    expect(sink.mock.calls[0]![0].message).toBe("stray");
    expect(sink.mock.calls[1]![0]).toBeInstanceOf(Error);
    expect(sink.mock.calls[1]![0].message).toContain("just a string");
    expect(sink.mock.calls[0]![1]).toEqual({ tags: { source: "unhandledRejection" } });
  });

  it("installs exactly one listener and uninstalls cleanly", () => {
    const before = process.listenerCount("unhandledRejection");
    const uninstall = installProcessErrorHandlers();
    expect(process.listenerCount("unhandledRejection")).toBe(before + 1);
    uninstall();
    expect(process.listenerCount("unhandledRejection")).toBe(before);
  });
});

describe("smoke-test auth (POST /internal/sentry-test)", () => {
  const token = "t".repeat(40);
  it("accepts only the exact bearer token", () => {
    expect(isAuthorizedSmokeTest(`Bearer ${token}`, token)).toBe(true);
    expect(isAuthorizedSmokeTest(`bearer ${token}`, token)).toBe(true);
    expect(isAuthorizedSmokeTest(`Bearer ${token}x`, token)).toBe(false);
    expect(isAuthorizedSmokeTest(`Bearer nope`, token)).toBe(false);
    expect(isAuthorizedSmokeTest(token, token)).toBe(false);
    expect(isAuthorizedSmokeTest(undefined, token)).toBe(false);
    expect(isAuthorizedSmokeTest("Bearer ", token)).toBe(false);
    expect(isAuthorizedSmokeTest(`Bearer ${token}`, "")).toBe(false);
  });
  it("throws a clearly labelled error", () => {
    expect(smokeTestError(new Date("2026-09-29T10:00:00Z")).message).toBe(
      "Sentry smoke test 2026-09-29T10:00:00.000Z (deliberate; safe to ignore)"
    );
  });
});
