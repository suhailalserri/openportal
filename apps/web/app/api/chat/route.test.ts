import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: "u1", email: "u1@example.com" } })) } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/account-guard-server", () => ({ rejectUnusableAccount: vi.fn(async () => null) }));

import { POST } from "./route";

/**
 * P1.3: the proxy must hand the api a client IP taken ONLY from Vercel's
 * trusted headers, and must never copy a caller-supplied X-Client-IP.
 */
function chatRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ model: "m", messages: [] }),
  });
}

describe("POST /api/chat - X-Client-IP forwarding", () => {
  const fetchMock = vi.fn(async (_url: string, _init?: unknown) => new Response("ok", { status: 200 }));

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("INTERNAL_API_URL", "http://api.test");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "t".repeat(40));
    vi.stubEnv("VERCEL", "1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function sentHeaders(): Record<string, string> {
    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> } | undefined;
    return init?.headers ?? {};
  }

  it("forwards the Vercel-provided client IP and ignores forged x-client-ip / cf-connecting-ip", async () => {
    await POST(chatRequest({
      "x-vercel-forwarded-for": "198.51.100.7",
      "x-client-ip": "6.6.6.6",
      "cf-connecting-ip": "7.7.7.7",
    }));
    expect(sentHeaders()["X-Client-IP"]).toBe("198.51.100.7");
  });

  it("omits X-Client-IP entirely when no valid address is available, never passing a forged one through", async () => {
    await POST(chatRequest({ "x-client-ip": "6.6.6.6", "cf-connecting-ip": "7.7.7.7" }));
    const sent = sentHeaders();
    expect(Object.keys(sent).map((k) => k.toLowerCase())).not.toContain("x-client-ip");
  });

  it("still sends the internal auth headers", async () => {
    await POST(chatRequest({ "x-vercel-forwarded-for": "198.51.100.7" }));
    const sent = sentHeaders();
    expect(sent["X-User-ID"]).toBe("u1");
    expect(sent["Authorization"]).toBe(`Bearer ${"t".repeat(40)}`);
  });
});
