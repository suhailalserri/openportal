import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/monitoring/report", () => ({ reportError }));
vi.mock("@/server/context", () => ({ createContext: vi.fn(async () => ({})) }));
vi.mock("@/server/router", async () => {
  const { initTRPC, TRPCError } = await import("@trpc/server");
  const t = initTRPC.create();
  return {
    appRouter: t.router({
      boom: t.procedure.query(() => {
        throw new Error("db exploded");
      }),
      forbidden: t.procedure.query(() => {
        throw new TRPCError({ code: "FORBIDDEN", message: "ACCOUNT_SUSPENDED" });
      }),
      ok: t.procedure.query(() => "fine"),
    }),
  };
});

import { GET } from "./route";

/**
 * P2.1 (owner-approved frozen edit): tRPC swallows handler errors into a JSON
 * 500, so Next's onRequestError never saw them. onError must report server
 * faults - and only server faults - without ever passing procedure input on.
 */
describe("GET /api/trpc/[trpc] - Sentry reporting", () => {
  beforeEach(() => {
    reportError.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("reports an INTERNAL_SERVER_ERROR once, with the original error and the procedure name", async () => {
    const res = await GET(new Request("http://localhost/api/trpc/boom"));
    expect(res.status).toBe(500);
    expect(reportError).toHaveBeenCalledTimes(1);
    const [err, ctx] = reportError.mock.calls[0]!;
    expect((err as Error).message).toBe("db exploded");
    expect(ctx).toEqual({ source: "trpc-server", tags: { procedure: "boom" } });
  });

  it("does not report expected outcomes or successes", async () => {
    expect((await GET(new Request("http://localhost/api/trpc/forbidden"))).status).toBe(403);
    expect((await GET(new Request("http://localhost/api/trpc/ok"))).status).toBe(200);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("never forwards procedure input", async () => {
    const input = encodeURIComponent(JSON.stringify({ email: "victim@example.com" }));
    await GET(new Request(`http://localhost/api/trpc/boom?input=${input}`));
    expect(JSON.stringify(reportError.mock.calls)).not.toContain("victim@example.com");
  });
});
