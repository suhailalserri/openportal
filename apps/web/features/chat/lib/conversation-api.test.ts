import { describe, it, expect } from "vitest";

import {
  fetchConversationMessages,
  fetchConversationModelId,
  thinkingFromBlocks,
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


// P6.4: saved reasoning comes back after a reload.
describe("thinkingFromBlocks", () => {
  it("returns undefined for null, absent, non-array and block-free input", () => {
    for (const v of [null, undefined, "x", 5, {}, [], [{ type: "text", text: "hi" }]]) {
      expect(thinkingFromBlocks(v)).toBeUndefined();
    }
  });

  it("maps one thinking block; the duration becomes a relative start/end pair", () => {
    expect(thinkingFromBlocks([{ type: "thinking", thinking: "Let me think.", durationMs: 4200 }, { type: "text", text: "42" }]))
      .toEqual({ text: "Let me think.", startedAt: 0, endedAt: 4200 });
  });

  it("without a stored duration endedAt stays undefined (label without a time)", () => {
    expect(thinkingFromBlocks([{ type: "thinking", thinking: "hmm" }])).toEqual({ text: "hmm", startedAt: 0, endedAt: undefined });
  });

  it("joins several thinking blocks with a blank line and adds their durations", () => {
    expect(thinkingFromBlocks([
      { type: "thinking", thinking: "first", durationMs: 1000 },
      { type: "tool_use", id: "c", name: "f", input: {} },
      { type: "thinking", thinking: "second", durationMs: 500 },
    ])).toEqual({ text: "first\n\nsecond", startedAt: 0, endedAt: 1500 });
  });

  it("ignores malformed blocks and bad durations instead of throwing", () => {
    expect(thinkingFromBlocks([
      null, 7, "x", { type: "thinking" }, { type: "thinking", thinking: 3 }, { type: "thinking", thinking: "   " },
      { type: "mystery", thinking: "no" },
      { type: "thinking", thinking: "ok", durationMs: -5 },
    ])).toEqual({ text: "ok", startedAt: 0, endedAt: undefined });
    expect(thinkingFromBlocks([{ type: "thinking", thinking: "ok", durationMs: Number.NaN }])?.endedAt).toBeUndefined();
  });
});

describe("fetchConversationMessages — contentBlocks (P6.4)", () => {
  const base = {
    id: "m1", role: "assistant" as const, content: "42", createdAt: "2026-01-01T00:00:00.000Z",
    isPartial: false, feedback: null, modelId: null, inputTokens: null, outputTokens: null, creditCost: null,
  };
  const load = async (messages: unknown[]) => {
    const r = await fetchConversationMessages("c", (async () => res(200, { messages })) as unknown as typeof fetch);
    if (!r.ok) throw new Error("expected ok");
    return r.value;
  };

  it("a saved reply gets its thinking back; content stays the flat text", async () => {
    const [m] = await load([{ ...base, contentBlocks: [{ type: "thinking", thinking: "why", durationMs: 2000 }, { type: "text", text: "42" }] }]);
    expect(m!.content).toBe("42");
    expect(m!.thinking).toEqual({ text: "why", startedAt: 0, endedAt: 2000 });
  });

  it("a reasoning-only reply keeps empty content and its thinking", async () => {
    const [m] = await load([{ ...base, content: "", contentBlocks: [{ type: "thinking", thinking: "only thoughts" }] }]);
    expect(m!.content).toBe("");
    expect(m!.thinking?.text).toBe("only thoughts");
  });

  it("null, absent or garbage contentBlocks give no thinking key at all (old rows unchanged)", async () => {
    const out = await load([{ ...base, contentBlocks: null }, { ...base, id: "m2" }, { ...base, id: "m3", contentBlocks: "oops" }]);
    for (const m of out) expect("thinking" in m).toBe(false);
  });
});
