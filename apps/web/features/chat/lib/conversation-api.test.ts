import { describe, it, expect } from "vitest";

import { fetchConversationSystemPrompt, patchConversationSystemPrompt } from "./conversation-api";

function res(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  } as unknown as Response;
}

describe("fetchConversationSystemPrompt", () => {
  it("returns the saved prompt", async () => {
    const f = (async () => res(200, { id: "c1", systemPrompt: "Be terse.", messages: [] })) as unknown as typeof fetch;
    expect(await fetchConversationSystemPrompt("c1", f)).toEqual({ ok: true, value: "Be terse." });
  });

  it("maps a null column to an empty string (never null)", async () => {
    const f = (async () => res(200, { id: "c1", systemPrompt: null })) as unknown as typeof fetch;
    expect(await fetchConversationSystemPrompt("c1", f)).toEqual({ ok: true, value: "" });
  });

  it("flags 401 as unauthorized and other statuses as plain failures", async () => {
    const f401 = (async () => res(401)) as unknown as typeof fetch;
    const f404 = (async () => res(404)) as unknown as typeof fetch;
    expect(await fetchConversationSystemPrompt("c1", f401)).toEqual({ ok: false, status: 401, unauthorized: true });
    expect(await fetchConversationSystemPrompt("c1", f404)).toEqual({ ok: false, status: 404, unauthorized: false });
  });

  it("does not throw on a network error or a non-JSON body", async () => {
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchConversationSystemPrompt("c1", boom)).toEqual({ ok: false, status: 0, unauthorized: false });
    const bad = (async () => res(200)) as unknown as typeof fetch;
    expect((await fetchConversationSystemPrompt("c1", bad)).ok).toBe(false);
  });

  it("URL-encodes the id", async () => {
    let seen = "";
    const f = (async (url: string) => {
      seen = url;
      return res(200, { systemPrompt: "" });
    }) as unknown as typeof fetch;
    await fetchConversationSystemPrompt("a/b?c", f);
    expect(seen).toBe("/api/conversations/a%2Fb%3Fc");
  });
});

describe("patchConversationSystemPrompt", () => {
  it("sends PATCH with only { systemPrompt } and credentials", async () => {
    let captured: { url: string; init: RequestInit | undefined } | undefined;
    const f = (async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return res(200, { success: true });
    }) as unknown as typeof fetch;
    expect(await patchConversationSystemPrompt("c1", "Hi", f)).toEqual({ ok: true, value: true });
    expect(captured?.url).toBe("/api/conversations/c1");
    expect(captured?.init?.method).toBe("PATCH");
    expect(captured?.init?.credentials).toBe("include");
    expect(JSON.parse(String(captured?.init?.body))).toEqual({ systemPrompt: "Hi" });
  });

  it("sends an empty string to CLEAR (not an omitted key)", async () => {
    let body = "";
    const f = (async (_u: string, init?: RequestInit) => {
      body = String(init?.body);
      return res(200, { success: true });
    }) as unknown as typeof fetch;
    await patchConversationSystemPrompt("c1", "", f);
    expect(JSON.parse(body)).toEqual({ systemPrompt: "" });
  });

  it("reports failures without throwing", async () => {
    const f401 = (async () => res(401)) as unknown as typeof fetch;
    expect(await patchConversationSystemPrompt("c1", "x", f401)).toEqual({ ok: false, status: 401, unauthorized: true });
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await patchConversationSystemPrompt("c1", "x", boom)).toEqual({ ok: false, status: 0, unauthorized: false });
  });
});
