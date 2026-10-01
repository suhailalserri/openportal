import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn(async (_: unknown): Promise<unknown> => ({ user: { id: "u1", email: "u1@example.com" } }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: (a: unknown) => getSession(a) } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/account-guard-server", () => ({ rejectUnusableAccount: vi.fn(async () => null) }));

import { GET, POST } from "./route";

/**
 * P6.3c: the proxy must authenticate with the web session, hand the api only the internal credentials,
 * forward a fixed set of actions, and never copy caller-supplied identity headers.
 */
const ctx = (action: string) => ({ params: Promise.resolve({ action }) });
const post = (body: string, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/attachments/x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

describe("/api/attachments/[action]", () => {
  const fetchMock = vi.fn(async (_url: string, _init?: unknown) =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "set-cookie": "leak=1", "x-secret": "no" } }));

  beforeEach(() => {
    fetchMock.mockClear();
    getSession.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("INTERNAL_API_URL", "http://api.test");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "t".repeat(40));
    vi.stubEnv("VERCEL", "1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const sent = () => fetchMock.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body?: string }];

  it("forwards a POST with the internal token and the session's user id, never a caller-supplied identity", async () => {
    const res = await POST(post(`{"mimeType":"audio/webm","sizeBytes":10}`, { "x-user-id": "attacker", authorization: "Bearer evil", "x-client-ip": "6.6.6.6" }), ctx("upload-url"));
    expect(res.status).toBe(200);
    const [url, init] = sent();
    expect(url).toBe("http://api.test/attachments/upload-url");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe(`Bearer ${"t".repeat(40)}`);
    expect(init.headers["X-User-ID"]).toBe("u1");
    expect(Object.keys(init.headers).map((k) => k.toLowerCase())).not.toContain("x-client-ip");
    expect(init.body).toBe(`{"mimeType":"audio/webm","sizeBytes":10}`);
  });

  it("forwards GET status without a body", async () => {
    await GET(new NextRequest("http://localhost/api/attachments/status"), ctx("status"));
    const [url, init] = sent();
    expect(url).toBe("http://api.test/attachments/status");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("never passes the upstream's headers back to the browser", async () => {
    const res = await POST(post("{}"), ctx("confirm"));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("x-secret")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 401 without a session and calls nothing", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await POST(post("{}"), ctx("confirm"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s an unknown action, and an action used with the wrong method", async () => {
    expect((await POST(post("{}"), ctx("delete-everything"))).status).toBe(404);
    expect((await POST(post("{}"), ctx("status"))).status).toBe(404);
    expect((await GET(new NextRequest("http://localhost/api/attachments/get"), ctx("get"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body (400) and an oversized one (413) before calling the api", async () => {
    expect((await POST(post("{not json"), ctx("confirm"))).status).toBe(400);
    expect((await POST(post(JSON.stringify({ a: "x".repeat(9000) })), ctx("confirm"))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the api's error status and body through", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "INSUFFICIENT_BALANCE" }), { status: 402 }));
    const res = await POST(post("{}"), ctx("get"));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "INSUFFICIENT_BALANCE" });
  });

  it("answers 502 when the api is unreachable and 500 when INTERNAL_API_URL is missing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect((await POST(post("{}"), ctx("confirm"))).status).toBe(502);
    vi.stubEnv("INTERNAL_API_URL", "");
    expect((await POST(post("{}"), ctx("confirm"))).status).toBe(500);
  });
});
