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
// Everything vi.mock() factories close over must live inside vi.hoisted()
// (see the comment on the block below) — that includes MODEL_FIXTURES and
// modelIdRef, not just deductCreditsAtomicMock/chainableNoop, since the
// "@ai-platform/db" mock further down reads both.
const { deductCreditsAtomicMock, getBalanceMock, claimUserMessageMock, dbInsertMock, insertValuesCalls, chainableNoop, MODEL_FIXTURES, modelIdRef } = vi.hoisted(() => {
  // A stand-in for Drizzle's fluent query builder. Some call sites just
  // chain and `.catch()` (fire-and-forget message saves / timestamp
  // updates), but streamChat also does
  //   await db.insert(conversations).values(...).onConflictDoNothing()
  // — and `await` treats any object with a callable `.then` as a thenable.
  // A Proxy that returns itself for EVERY property (including "then") is
  // therefore a thenable whose then() never calls resolve, so that await
  // hangs forever (every test past the model lookup timed out at 60s).
  // Answering `undefined` for "then" makes the awaited value resolve to
  // the proxy itself, while all other chaining still returns the proxy.
  const makeChainableNoop = (): any => {
    const proxy: any = new Proxy(() => proxy, {
      get: (_target, prop) => (prop === "then" ? undefined : proxy),
      apply: () => proxy,
    });
    return proxy;
  };

  // B1: db.insert is now a purpose-built spy (not the generic chainableNoop
  // proxy) so idempotency/regenerate/system-prompt tests can assert both
  // WHICH TABLE and WITH WHAT VALUES an insert was attempted. Every real
  // call site in gateway.service.ts does exactly
  // `db.insert(table).values(v).onConflictDoNothing()` (conversations) or
  // `db.insert(table).values(v).catch(fn)` (messages) — never .set()/
  // .where() on an insert chain (those only appear on db.update, which
  // stays on the generic chainableNoop below) — so this narrower shape is
  // sufficient and lets .values()'s argument be captured directly instead
  // of reverse-engineered out of a Proxy.
  const insertValuesCalls: Array<{ table: string | undefined; values: unknown }> = [];
  const dbInsertMock = vi.fn((table: { __table?: string } | undefined) => ({
    values: (v: unknown) => {
      insertValuesCalls.push({ table: table?.__table, values: v });
      return {
        onConflictDoNothing: () => Promise.resolve(),
        catch: (_fn: unknown) => Promise.resolve(),
      };
    },
  }));

  return {
    // vi.fn() created INSIDE vi.hoisted so it's a real, call-trackable spy
    // that's still safely initialized before the vi.mock factory runs.
    // (Referencing `vi` itself here is safe — Vitest hoists the `import
    // { vi } from "vitest"` above vi.mock/vi.hoisted specifically so this works.)
    deductCreditsAtomicMock: vi.fn().mockResolvedValue({ success: true, newBalance: 999 }),
    // Affordability pre-check (see checkAffordability in gateway.service.ts)
    // now reads the balance before every request. Defaults to a balance
    // large enough that no existing test's cost calc could ever exceed it,
    // so pre-fix test behavior is preserved unless a test explicitly
    // overrides this (the new insufficient-balance tests below do).
    getBalanceMock: vi.fn().mockResolvedValue({ credits: 999_000_000, totalSpent: 0, totalRedeemed: 0 }),
    // B1/F4: defaults to "first time seeing this pair" for every test that
    // doesn't care about idempotency. Individual tests override this with
    // .mockResolvedValueOnce(...) / .mockResolvedValue(false) as needed.
    claimUserMessageMock: vi.fn().mockResolvedValue(true),
    dbInsertMock,
    insertValuesCalls,
    chainableNoop: makeChainableNoop,
    // Fixture rows for the one model these tests actually route through.
    // gateway.service.ts's calcCreditCost() reads wholesaleCostInputPerM /
    // wholesaleCostOutputPerM / markupMultiplier as strings (numeric columns
    // come back as strings from the pg driver — see models.ts) and
    // streamChat's pre-flight gate requires status="published" AND
    // isAvailable=true, so both must be set correctly for "deepseek-r2" to
    // resolve at all.
    //
    // The real query is `db.query.models.findFirst({ where: and(eq(models.id,
    // modelId), eq(models.status,"published"), eq(models.isAvailable,true)) })`.
    // `where` is a compiled Drizzle SQL fragment, not something a plain mock
    // can cheaply introspect to recover `modelId` from. Rather than parse it,
    // the mock below keys off `modelIdRef.current` — set immediately before
    // each streamChat() call via callStreamChat() further down — which every
    // test already effectively knows (it's the same modelId passed into
    // opts/baseOpts).
    MODEL_FIXTURES: {
      "deepseek-r2": {
        id: "deepseek-r2",
        status: "published",
        isAvailable: true,
        contextWindow: 65536, // smallest context window on purpose — see baseOpts comment
        maxOutputTokens: 8192,
        wholesaleCostInputPerM: "0.14",
        wholesaleCostOutputPerM: "0.28",
        markupMultiplier: "2.0",
      },
    } as Record<string, Record<string, unknown>>,
    // Plain `let` reassignment doesn't survive being destructured out of
    // vi.hoisted() the way a const object does, so this is a mutable-field
    // holder instead — callStreamChat() sets modelIdRef.current.
    modelIdRef: { current: "" },
  };
});

vi.mock("./balance.service", () => ({
  deductCreditsAtomic: (...args: unknown[]) => deductCreditsAtomicMock(...args),
  getBalance: (...args: unknown[]) => getBalanceMock(...args),
}));

// B1/F4: claimUserMessage is mocked separately from the Redis it normally
// talks to (chat-idempotency.service.test.ts covers the real Redis-facing
// logic and fail-open behavior in isolation). Here we only care whether
// streamChat calls it with the right args and honors its return value.
vi.mock("./chat-idempotency.service", () => ({
  claimUserMessage: (...args: unknown[]) => claimUserMessageMock(...args),
  chatIdempotencyRedis: {}, // never touched: streamChat always receives opts.idempotencyRedis in tests, or skips the claim call entirely when clientMessageId is absent
}));

vi.mock("@ai-platform/db", () => ({
  db: {
    // Only db.query.models.findFirst is used by streamChat's pre-flight
    // model lookup (see gateway.service.ts) — everything else (message/
    // conversation inserts, timestamp updates) is fire-and-forget writes
    // this file mostly doesn't assert on, so they fall through to
    // chainableNoop via dbInsertMock — except call COUNT/table, which the
    // B1 idempotency/regenerate tests do assert on.
    //
    // conversations.findFirst / platformConfig.findFirst back
    // history-compaction.service.ts's buildSystemPrompt()/compactHistory()
    // calls, which every streamChat() call now makes. Both return "nothing
    // saved yet" by default — no platform base prompt, no prior summary —
    // which is exactly the steady state for every existing test's fixture
    // conversation/model, so none of them needed to change their own
    // expectations because of this.
    query: {
      models: {
        findFirst: vi.fn(async () => MODEL_FIXTURES[modelIdRef.current]),
      },
      conversations: {
        findFirst: vi.fn(async () => ({ summary: null, summarizedMessageCount: 0 })),
      },
      platformConfig: {
        findFirst: vi.fn(async () => ({ basePrompt: null })),
      },
    },
    insert: dbInsertMock,
    update: chainableNoop(),
  },
  // Distinguishable markers so dbInsertMock.mock.calls[i][0] tells a test
  // which table a given insert() call targeted — real Drizzle table objects
  // are far richer than this, but streamChat only ever uses these as opaque
  // "which table" tokens (passed straight into db.insert(...)), never
  // introspected.
  messages: { __table: "messages" },
  conversations: { __table: "conversations", id: "conversations.id" },
  platformConfig: { id: "platformConfig.id" },
  PLATFORM_CONFIG_ID: "00000000-0000-0000-0000-000000000001",
  // Only ever used as `eq(models.id, x)` / `eq(models.status, x)` etc. —
  // findFirst above never evaluates the resulting SQL fragment, so these
  // just need to be stable, distinguishable values, not real columns.
  models: { id: "models.id", status: "models.status", isAvailable: "models.isAvailable" },
}));

/** Wraps streamChat so every call sets modelIdRef.current first — see above. */
async function callStreamChat(opts: Parameters<typeof streamChat>[0]): Promise<void> {
  modelIdRef.current = opts.model;
  await streamChat(opts);
}

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
  getBalanceMock.mockClear();
  getBalanceMock.mockResolvedValue({ credits: 999_000_000, totalSpent: 0, totalRedeemed: 0 });
  claimUserMessageMock.mockClear();
  claimUserMessageMock.mockResolvedValue(true);
  dbInsertMock.mockClear();
  insertValuesCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChat", () => {
  it("rejects an unknown model before ever calling fetch or billing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { reply, sends } = makeReply();

    await callStreamChat({ ...baseOpts, model: "not-a-real-model", reply });

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
    await callStreamChat({ ...baseOpts, messages: [hugeMessage], reply });

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
    await callStreamChat({ ...baseOpts, reply });

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
    // Deliver one real chunk, THEN fail on the next pull. Doing enqueue()
    // and error() in the same pull() would be wrong: error() resets the
    // stream's queue, so the chunk would be discarded before the consumer
    // ever reads it and the test would exercise "no content" instead.
    let pulls = 0;
    const interruptedStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls++ === 0) {
          controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":"partial"}}]}\n\n`));
        } else {
          controller.error(new Error("simulated connection drop"));
        }
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, body: interruptedStream, json: async () => ({}),
    }));

    const { reply } = makeReply();
    await callStreamChat({ ...baseOpts, reply });

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
    await callStreamChat({ ...baseOpts, reply });

    expect(deductCreditsAtomicMock).not.toHaveBeenCalled();
    expect(sends).toEqual([{ code: 429, body: expect.objectContaining({ status: 429 }) }]);
    expect(reply.raw.end).not.toHaveBeenCalled();
  });
});

// ── B1: generation params (F3), idempotency (F4), client disconnect (F5) ──
describe("streamChat — B1 additions", () => {
  it("forwards temperature, top_p, and max_tokens (clamped to the model's ceiling) to the gateway body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: makeSseStream([`data: [DONE]\n\n`]), json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { reply } = makeReply();
    // deepseek-r2's maxOutputTokens fixture is 8192 — request more than
    // that and confirm it gets clamped down, not passed through raw or
    // rejected outright.
    await callStreamChat({ ...baseOpts, temperature: 0.4, top_p: 0.8, max_tokens: 50_000, reply });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.temperature).toBe(0.4);
    expect(sentBody.top_p).toBe(0.8);
    expect(sentBody.max_tokens).toBe(8192); // clamped, not 50_000
  });

  it("omits temperature/top_p when not provided (no false 0s/nulls), but always sends an affordability-bounded max_tokens", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: makeSseStream([`data: [DONE]\n\n`]), json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { reply } = makeReply();
    await callStreamChat({ ...baseOpts, reply });

    const [, init] = fetchSpy.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody).not.toHaveProperty("temperature");
    expect(sentBody).not.toHaveProperty("top_p");
    // BUG FIX regression test: max_tokens must now ALWAYS be present and
    // bounded by what the caller's balance can afford (here, the model's
    // own 8192 ceiling, since getBalanceMock's default balance is huge) —
    // never omitted. Omitting it is exactly what let a request run
    // unbounded against an underfunded balance in the reported bug.
    expect(sentBody.max_tokens).toBe(8192);
  });

  it("rejects with 402 INSUFFICIENT_BALANCE when the balance can't cover even the input tokens, without calling fetch", async () => {
    getBalanceMock.mockResolvedValueOnce({ credits: 0, totalSpent: 0, totalRedeemed: 0 });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { reply, sends } = makeReply();
    await callStreamChat({ ...baseOpts, reply });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sends).toEqual([
      expect.objectContaining({ code: 402, body: expect.objectContaining({ error: "INSUFFICIENT_BALANCE" }) }),
    ]);
  });

  it("clamps max_tokens down to what a low (but positive) balance can afford, instead of letting the request run unbounded", async () => {
    // deepseek-r2 fixture: wholesaleCostOutputPerM "0.28", markup "2.0" ->
    // 0.56 USD per 1M output tokens -> at CREDIT_VALUE_USD=0.001, that's
    // 560 micro-credits per output token. A 50,000-micro-credit balance
    // (0.05 credits) after input cost affords ~89 output tokens — far
    // below the model's 8192 ceiling and below any requested max_tokens.
    getBalanceMock.mockResolvedValueOnce({ credits: 50_000, totalSpent: 0, totalRedeemed: 0 });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: makeSseStream([`data: [DONE]\n\n`]), json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { reply } = makeReply();
    await callStreamChat({ ...baseOpts, max_tokens: 8192, reply });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.max_tokens).toBeLessThan(8192);
    expect(sentBody.max_tokens).toBeGreaterThan(0);
  });

  it("logs instead of silently swallowing when deductCreditsAtomic resolves { success: false } after a completed stream", async () => {
    // This is the exact bug reported: a resolved (not thrown) billing
    // failure used to vanish into a bare .catch(console.error), which
    // only ever catches thrown errors. Confirm it's now inspected.
    deductCreditsAtomicMock.mockResolvedValueOnce({ success: false, newBalance: 0, reason: "INSUFFICIENT_BALANCE" });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      body: makeSseStream([`data: {"choices":[{"delta":{"content":"hi"}}]}\n\n`, `data: [DONE]\n\n`]),
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { reply } = makeReply();
    await callStreamChat({ ...baseOpts, reply });

    expect(deductCreditsAtomicMock).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("[billing] deduction failed after a completed stream"));
    consoleErrorSpy.mockRestore();
  });

  it("prepends the server-assembled system prompt (platform + model) as a leading system message", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: makeSseStream([`data: [DONE]\n\n`]), json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { db } = await import("@ai-platform/db");
    (db.query.platformConfig.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      basePrompt: "Base rules.",
    });
    MODEL_FIXTURES[modelIdRef.current || "deepseek-r2"]!.systemPrompt = "Model rules.";

    const { reply } = makeReply();
    await callStreamChat({ ...baseOpts, reply });

    const [, init] = fetchSpy.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.messages[0]).toEqual({
      role: "system",
      content: "Base rules.\n\n---\n\nModel rules.",
    });
    expect(sentBody.messages.slice(1)).toEqual(baseOpts.messages);

    delete MODEL_FIXTURES["deepseek-r2"]!.systemPrompt;
  });

  it("sends no system message at all when neither the platform nor the model has a prompt set", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: makeSseStream([`data: [DONE]\n\n`]), json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { reply } = makeReply();
    await callStreamChat({ ...baseOpts, reply });

    const [, init] = fetchSpy.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.messages).toEqual(baseOpts.messages);
  });

  it("skips the user-message insert entirely when regenerate is true, and never calls claimUserMessage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, body: makeSseStream([`data: [DONE]\n\n`]), json: async () => ({}),
    }));

    const { reply } = makeReply();
    await callStreamChat({ ...baseOpts, regenerate: true, clientMessageId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", reply });

    expect(claimUserMessageMock).not.toHaveBeenCalled();
    const userMessageInserts = dbInsertMock.mock.calls.filter(
      (call) => (call[0] as { __table?: string })?.__table === "messages",
    );
    expect(userMessageInserts).toHaveLength(0);
  });

  it("claims clientMessageId before inserting the user row, and skips the insert when the claim reports a duplicate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, body: makeSseStream([`data: [DONE]\n\n`]), json: async () => ({}),
    }));
    claimUserMessageMock.mockResolvedValueOnce(false); // simulate: already claimed (a retry)

    const { reply } = makeReply();
    await callStreamChat({ ...baseOpts, clientMessageId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", reply });

    expect(claimUserMessageMock).toHaveBeenCalledWith(
      expect.anything(), baseOpts.conversationId, "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    );
    const userMessageInserts = dbInsertMock.mock.calls.filter(
      (call) => (call[0] as { __table?: string })?.__table === "messages",
    );
    expect(userMessageInserts).toHaveLength(0);
  });

  it("inserts the user row once when clientMessageId claims successfully (first time seeing it)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, body: makeSseStream([`data: [DONE]\n\n`]), json: async () => ({}),
    }));
    claimUserMessageMock.mockResolvedValueOnce(true);

    const { reply } = makeReply();
    await callStreamChat({ ...baseOpts, clientMessageId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", reply });

    const userMessageInserts = dbInsertMock.mock.calls.filter(
      (call) => (call[0] as { __table?: string })?.__table === "messages",
    );
    expect(userMessageInserts).toHaveLength(1);
  });

  it("stops silently on client disconnect (aborted signal) without sending any reply", async () => {
    // Real `fetch` rejects with a DOMException named "AbortError" when its
    // signal is already aborted at call time — this mock reproduces that
    // exact shape rather than a generic rejection, since streamChat's catch
    // block distinguishes "client disconnect" from "gateway/timeout error"
    // purely from signal state, not from the error itself.
    const fetchSpy = vi.fn((_url: string, init: RequestInit) => {
      if ((init.signal as AbortSignal)?.aborted) {
        return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
      }
      return Promise.resolve({ ok: true, status: 200, body: makeSseStream([`data: [DONE]\n\n`]), json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const preAborted = new AbortController();
    preAborted.abort(new DOMException("client disconnected", "AbortError"));

    const { reply, sends } = makeReply();
    await callStreamChat({ ...baseOpts, abortSignal: preAborted.signal, reply });

    // No error response is sent — the client is already gone, there's
    // nothing to send it to — and billing never fires (F5's whole point:
    // a disconnect before/without streamed content must not be paid for).
    expect(sends).toEqual([]);
    expect(deductCreditsAtomicMock).not.toHaveBeenCalled();
    expect(reply.raw.end).not.toHaveBeenCalled();
  });

  it("still times out normally (504) when only the safety timeout fires, not the client's own signal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }),
    ));

    // A live, never-aborted client signal — proves the 504 path still works
    // when abortSignal is wired up but isn't the one that fired.
    const liveSignal = new AbortController().signal;
    const { reply, sends } = makeReply();
    await callStreamChat({ ...baseOpts, abortSignal: liveSignal, reply });

    expect(sends).toEqual([{ code: 504, body: expect.objectContaining({ error: "TIMEOUT" }) }]);
  });
});
