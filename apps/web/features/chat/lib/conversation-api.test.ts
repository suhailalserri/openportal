import { describe, it, expect } from "vitest";

import {
  fetchConversationSystemPrompt,
  patchConversationSystemPrompt,
  fetchConversationMessages,
  fetchConversationModelId,
} from "./conversation-api";

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

describe("fetchConversationMessages", () => {
  const row = {
    id: "m1",
    role: "assistant" as const,
    content: "hi",
    createdAt: "2026-01-01T00:00:00.000Z",
    isPartial: false,
    feedback: null,
    modelId: null,
    inputTokens: null,
    outputTokens: null,
    creditCost: null,
  };

  it("maps a full row, omitting null optional fields entirely", async () => {
    const full = {
      ...row,
      feedback: "positive" as const,
      modelId: "gpt-4o",
      inputTokens: 10,
      outputTokens: 20,
      creditCost: 5,
    };
    const f = (async () => res(200, { id: "c1", messages: [full] })) as unknown as typeof fetch;
    const result = await fetchConversationMessages("c1", f);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: "m1",
          role: "assistant",
          content: "hi",
          createdAt: "2026-01-01T00:00:00.000Z",
          isPartial: false,
          feedback: "positive",
          modelId: "gpt-4o",
          inputTokens: 10,
          outputTokens: 20,
          creditCost: 5,
        },
      ],
    });
    // Never `null` on any field: exactOptionalPropertyTypes-safe shape.
    expect(Object.values(result.ok ? result.value[0]! : {})).not.toContain(null);
  });

  it("omits nullable columns as absent keys, not null", async () => {
    const f = (async () => res(200, { id: "c1", messages: [row] })) as unknown as typeof fetch;
    const result = await fetchConversationMessages("c1", f);
    expect(result.ok).toBe(true);
    const mapped = result.ok ? result.value[0] : undefined;
    expect(mapped).toEqual({
      id: "m1",
      role: "assistant",
      content: "hi",
      createdAt: "2026-01-01T00:00:00.000Z",
      isPartial: false,
    });
    expect(mapped && "feedback" in mapped).toBe(false);
    expect(mapped && "modelId" in mapped).toBe(false);
  });

  it("returns an empty list (ok:true) on 404 — a not-yet-created conversation", async () => {
    const f = (async () => res(404)) as unknown as typeof fetch;
    expect(await fetchConversationMessages("brand-new-id", f)).toEqual({ ok: true, value: [] });
  });

  it("flags a real 401 as unauthorized, other statuses as plain failures", async () => {
    const f401 = (async () => res(401)) as unknown as typeof fetch;
    const f500 = (async () => res(500)) as unknown as typeof fetch;
    expect(await fetchConversationMessages("c1", f401)).toEqual({ ok: false, status: 401, unauthorized: true });
    expect(await fetchConversationMessages("c1", f500)).toEqual({ ok: false, status: 500, unauthorized: false });
  });

  it("does not throw on a network error or a non-JSON body", async () => {
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchConversationMessages("c1", boom)).toEqual({ ok: false, status: 0, unauthorized: false });
    const bad = (async () => res(200)) as unknown as typeof fetch;
    expect((await fetchConversationMessages("c1", bad)).ok).toBe(false);
  });

  it("URL-encodes the id", async () => {
    let seen = "";
    const f = (async (url: string) => {
      seen = url;
      return res(200, { id: "c1", messages: [] });
    }) as unknown as typeof fetch;
    await fetchConversationMessages("a/b?c", f);
    expect(seen).toBe("/api/conversations/a%2Fb%3Fc");
  });
});

describe("fetchConversationModelId", () => {
  it("returns the conversation's modelId", async () => {
    const f = (async () => res(200, { id: "c1", modelId: "gpt-4o" })) as unknown as typeof fetch;
    expect(await fetchConversationModelId("c1", f)).toEqual({ ok: true, value: "gpt-4o" });
  });

  it("maps a null modelId to undefined, not null", async () => {
    const f = (async () => res(200, { id: "c1", modelId: null })) as unknown as typeof fetch;
    const result = await fetchConversationModelId("c1", f);
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("returns ok:true, value:undefined on 404 — a not-yet-created conversation", async () => {
    const f = (async () => res(404)) as unknown as typeof fetch;
    expect(await fetchConversationModelId("brand-new-id", f)).toEqual({ ok: true, value: undefined });
  });

  it("flags a real 401 as unauthorized, other statuses as plain failures", async () => {
    const f401 = (async () => res(401)) as unknown as typeof fetch;
    const f500 = (async () => res(500)) as unknown as typeof fetch;
    expect(await fetchConversationModelId("c1", f401)).toEqual({ ok: false, status: 401, unauthorized: true });
    expect(await fetchConversationModelId("c1", f500)).toEqual({ ok: false, status: 500, unauthorized: false });
  });

  it("does not throw on a network error or a non-JSON body", async () => {
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchConversationModelId("c1", boom)).toEqual({ ok: false, status: 0, unauthorized: false });
    const bad = (async () => res(200)) as unknown as typeof fetch;
    expect((await fetchConversationModelId("c1", bad)).ok).toBe(false);
  });
});
