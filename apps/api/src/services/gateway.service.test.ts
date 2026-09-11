import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks (hoisted above imports by Vitest) ──────────────────────────────
//
// gateway.service.ts pulls in "../config", which eagerly Zod-validates
// process.env and calls `process.exit(1)` on failure — fine in production,
// but fatal to a test worker if any required var is missing. Mocking it
// out entirely sidesteps that, rather than trying to satisfy ~15 required
// env vars just to import a module we're not testing here.
vi.mock("../config", () => ({
  config: { GATEWAY_URL: "http://mock-gateway.test", GATEWAY_MASTER_KEY: "mock-key" },
}));

// `vi.mock(...)` factories run BEFORE regular top-level `const`/`function`
// declarations are initialized (Vitest hoists the mock registration itself
// above the rest of the file). Referencing an ordinary outer `const` inside
// a factory throws "Cannot access before initialization" — `vi.hoisted()`
// is the correct escape hatch: it hoists its own contents right along with
// the mocks, so both are safely initialized before any import runs.
const { deductCreditsAtomicMock, chainableNoop } = vi.hoisted(() => {
  return {
    // vi.fn() created INSIDE vi.hoisted so it's a real, call-trackable spy
    // that's still safely initialized before the vi.mock factory runs.
    // (Referencing `vi` itself here is safe — Vitest hoists the `import
    // { vi } from "vitest"` above vi.mock/vi.hoisted specifically so this works.)
    deductCreditsAtomicMock: vi.fn().mockResolvedValue({ success: true, newBalance: 999 }),
    // Message-save / conversation-timestamp-update are fire-and-forget
    // writes unrelated to what this file covers (billing + passthrough).
    // A Proxy that returns itself from any property access or call lets
    // `.insert(x).values(y).catch(z)` and `.update(x).set(y).where(z).catch(w)`
    // both resolve harmlessly instead of opening a real connection.
    chainableNoop: (): any => {
      const proxy: any = new Proxy(() => proxy, { get: () => proxy, apply: () => proxy });
      return proxy;
    },
  };
});

vi.mock("./balance.service", () => ({
  deductCreditsAtomic: (...args: unknown[]) => deductCreditsAtomicMock(...args),
}));

vi.mock("@ai-platform/db", () => ({
  db: chainableNoop(),
  messages: {},
  conversations: {},
}));

const { streamChat } = await import("./gateway.service");

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]!));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

function makeReply() {
  const writes: string[] = [];
  const sends: Array<{ code: number; body: unknown }> = [];
  return {
    reply: {
      raw: {
        setHeader: vi.fn(),
        write: vi.fn((chunk: string) => { writes.push(chunk); }),
        end: vi.fn(),
      },
      status: vi.fn((code: number) => ({
        send: vi.fn((body: unknown) => { sends.push({ code, body }); }),
      })),
    },
    writes,
    sends,
  };
}

const baseOpts = {
  userId: "user-1",
  model: "deepseek-r2", // smallest context window (64k) — cheap to overflow in tests
  messages: [{ role: "user", content: "hello" }],
  conversationId: "conv-1",
};

beforeEach(() => {
  deductCreditsAtomicMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChat", () => {
  it("rejects an unknown model before ever calling fetch or billing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { reply, sends } = makeReply();

    await streamChat({ ...baseOpts, model: "not-a-real-model", reply });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(deductCreditsAtomicMock).not.toHaveBeenCalled();
    // Errors discovered before any streaming has begun are sent as a plain
    // non-2xx JSON response (not raw SSE-framed text) so useChat's own
    // ok-check surfaces the real reason instead of failing to parse it.
    expect(sends).toEqual([{ code: 404, body: expect.objectContaining({ error: "MODEL_NOT_FOUND" }) }]);
    expect(reply.raw.end).not.toHaveBeenCalled();
  });

  it("rejects an oversized request before calling fetch (saves wasted provider spend)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { reply, sends } = makeReply();

    const hugeMessage = { role: "user", content: "x".repeat(300_000) }; // deepseek-r2 context is 64k tokens
    await streamChat({ ...baseOpts, messages: [hugeMessage], reply });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(deductCreditsAtomicMock).not.toHaveBeenCalled();
    expect(sends).toEqual([{ code: 400, body: expect.objectContaining({ error: "CONTEXT_TOO_LONG" }) }]);
  });

  it("forwards only the plain-text content of each delta, in order, and bills exactly once on completion", async () => {
    const sseChunks = [
      `data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":"lo "}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":"world"}}]}\n\n`,
      `data: {"usage":{"prompt_tokens":12,"completion_tokens":34}}\n\n`,
      `data: [DONE]\n\n`,
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeSseStream(sseChunks),
      json: async () => ({}),
    }));

    const { reply, writes } = makeReply();
    await streamChat({ ...baseOpts, reply });

    // Only the extracted text content is forwarded — no SSE framing, no
    // JSON envelope — because useChat's `streamProtocol: "text"` expects
    // a plain, unframed text stream, not the upstream's raw OpenAI format.
    // The usage/[DONE] chunks carry no "content" field, so they produce
    // no write at all.
    expect(writes).toEqual(["Hel", "lo ", "world"]);

    // Billing fired exactly once, with the token counts parsed from the
    // upstream's usage chunk and the correct model.
    expect(deductCreditsAtomicMock).toHaveBeenCalledOnce();
    const [, , , metadata] = deductCreditsAtomicMock.mock.calls[0]!;
    expect((metadata as any).modelId).toBe("deepseek-r2");
    expect((metadata as any).inputTokens).toBe(12);
    expect((metadata as any).outputTokens).toBe(34);

    expect(reply.raw.end).toHaveBeenCalledOnce();
  });

  it("still bills for partial content if the stream is interrupted mid-response", async () => {
    const encoder = new TextEncoder();
    const interruptedStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":"partial"}}]}\n\n`));
        controller.error(new Error("simulated connection drop"));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, body: interruptedStream, json: async () => ({}),
    }));

    const { reply } = makeReply();
    await streamChat({ ...baseOpts, reply });

    // No usage chunk ever arrived (outputTokens stays 0), but content WAS
    // received before the drop, so billing must still fire for what was
    // actually streamed — never silently eat a partial, already-incurred cost.
    expect(deductCreditsAtomicMock).toHaveBeenCalledOnce();
    expect(reply.raw.end).toHaveBeenCalledOnce();
  });

  it("does not bill at all when the upstream fails before any content streams", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 429, json: async () => ({ error: { code: "rate_limited" } }),
    }));

    const { reply, sends } = makeReply();
    await streamChat({ ...baseOpts, reply });

    expect(deductCreditsAtomicMock).not.toHaveBeenCalled();
    expect(sends).toEqual([{ code: 429, body: expect.objectContaining({ status: 429 }) }]);
    expect(reply.raw.end).not.toHaveBeenCalled();
  });
});
