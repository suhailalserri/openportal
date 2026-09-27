import { describe, it, expect } from "vitest";

import {
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

// fetchConversationSystemPrompt / patchConversationSystemPrompt and their
// tests were removed along with the feature: users don't get a
// per-conversation system prompt anymore (see conversation-api.ts header
// and packages/db/src/migrations/0014_*.sql).

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
