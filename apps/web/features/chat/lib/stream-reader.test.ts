import { describe, it, expect, vi, afterEach } from "vitest";

import { autoRetryDelayMs, runChatStream, type StreamCallbacks } from "./stream-reader";

/**
 * apps/web/features/chat/lib/stream-reader.test.ts
 *
 * Phase 4b. Node's global `fetch`/`Response`/`TextEncoder`/`TextDecoder`
 * /`AbortController` are all real (Node 18+, `environment: "node"` in
 * vitest.config.ts — no jsdom needed, same reasoning as
 * safe-markdown.test.tsx's own header comment on why this sandbox
 * avoids adding new deps). Only `global.fetch` itself is stubbed, per
 * test, with a fake `Response`-shaped object whose `body.getReader()`
 * returns a hand-built reader — this drives the exact byte sequences
 * each test needs without any real network or a real ReadableStream.
 */

function fakeReader(
  chunks: Uint8Array[],
  opts?: { throwAfter?: number; throwAsAbort?: boolean },
): { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } {
  let i = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (opts?.throwAfter !== undefined && i === opts.throwAfter) {
          if (opts.throwAsAbort) {
            const err = new Error("aborted");
            err.name = "AbortError";
            throw err;
          }
          throw new Error("network drop");
        }
        if (i >= chunks.length) return { done: true };
        // noUncheckedIndexedAccess (this repo's tsconfig — confirmed by the
        // register/page.tsx round-2 fix in BRANCH_AND_CI_NOTES.md, Session
        // 3.1) types chunks[i] as Uint8Array | undefined even though the
        // guard above already proves it's defined here. That undefined
        // leaking into `value` is what broke assignability against this
        // function's declared return type under exactOptionalPropertyTypes
        // (CI: TS2322 at this file's line 25, cascading into the real
        // TS2379 at stream-reader.ts:94). The `!` is safe specifically
        // because of the bounds check two lines up, not a blind unwrap.
        const value = chunks[i]!;
        i += 1;
        return { done: false, value };
      },
    }),
  };
}

function collectingCallbacks(): StreamCallbacks & {
  chunks: string[];
  calls: string[];
} {
  const chunks: string[] = [];
  const calls: string[] = [];
  return {
    chunks,
    calls,
    onChunk: (delta) => {
      chunks.push(delta);
      calls.push("chunk");
    },
    onDone: () => calls.push("done"),
    onStopped: () => calls.push("stopped"),
    onPartial: () => calls.push("partial"),
    onError: () => calls.push("error"),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runChatStream — chunk delivery", () => {
  it("delivers each chunk in order via a separate onChunk call, never buffered to the end", async () => {
    const encoder = new TextEncoder();
    const reader = fakeReader([encoder.encode("Hello"), encoder.encode(", "), encoder.encode("world")]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, body: reader }) as unknown as Response),
    );

    const cb = collectingCallbacks();
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, cb);

    expect(cb.chunks).toEqual(["Hello", ", ", "world"]);
    expect(cb.calls).toEqual(["chunk", "chunk", "chunk", "done"]);
  });

  it("decodes a multi-byte Arabic character split across two chunks correctly", async () => {
    const original = "مرحبا بك"; // every Arabic letter here is a 2-byte UTF-8 sequence
    const bytes = new TextEncoder().encode(original);
    // Split inside the FIRST character's 2-byte sequence — the worst case.
    const splitAt = 1;
    const reader = fakeReader([bytes.slice(0, splitAt), bytes.slice(splitAt)]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, body: reader }) as unknown as Response),
    );

    const cb = collectingCallbacks();
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, cb);

    // The first (1-byte) chunk decodes to nothing yet (incomplete
    // sequence, correctly buffered inside TextDecoder); everything
    // appears once the second chunk completes it. Either way, the
    // concatenation must exactly equal the original string — no
    // replacement characters (U+FFFD), no corruption.
    expect(cb.chunks.join("")).toBe(original);
    expect(cb.chunks.join("")).not.toContain("\uFFFD");
  });
});

describe("runChatStream — Stop", () => {
  it("calls onStopped, not onError or onPartial, when the read loop aborts", async () => {
    const encoder = new TextEncoder();
    const reader = fakeReader([encoder.encode("partial answer")], {
      throwAfter: 1,
      throwAsAbort: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, body: reader }) as unknown as Response),
    );

    const controller = new AbortController();
    const cb = collectingCallbacks();
    await runChatStream({ model: "gpt-4o", messages: [] }, controller.signal, cb);

    expect(cb.calls).toEqual(["chunk", "stopped"]);
  });

  it("calls onStopped, not onError, when fetch itself rejects with AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }),
    );

    const cb = collectingCallbacks();
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, cb);

    expect(cb.calls).toEqual(["stopped"]);
  });
});

describe("runChatStream — network drop mid-stream", () => {
  it("reports partial (not error) when the connection drops after some content arrived", async () => {
    const encoder = new TextEncoder();
    const reader = fakeReader([encoder.encode("Some content already ")], { throwAfter: 1 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, body: reader }) as unknown as Response),
    );

    const cb = collectingCallbacks();
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, cb);

    expect(cb.chunks).toEqual(["Some content already "]);
    expect(cb.calls).toEqual(["chunk", "partial"]);
  });

  it("reports error (not partial) when the connection drops before any content arrived", async () => {
    const reader = fakeReader([], { throwAfter: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, body: reader }) as unknown as Response),
    );

    const cb = collectingCallbacks();
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, cb);

    expect(cb.calls).toEqual(["error"]);
  });
});

describe("runChatStream — HTTP error responses", () => {
  it("maps a JSON gateway error body to onError with the server's own message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 402,
            json: async () => ({ error: "INSUFFICIENT_BALANCE", message: "رصيدك صفر." }),
          }) as unknown as Response,
      ),
    );

    const cb = collectingCallbacks();
    const errors: { message: string; retryable: boolean }[] = [];
    await runChatStream(
      { model: "gpt-4o", messages: [] },
      new AbortController().signal,
      { ...cb, onError: (e) => errors.push(e) },
    );

    expect(errors).toEqual([{ message: "رصيدك صفر.", retryable: false }]);
  });

  it("treats an unrecognized error code as retryable by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 503,
            json: async () => ({ error: "MODEL_UNAVAILABLE", message: "النموذج غير متاح." }),
          }) as unknown as Response,
      ),
    );

    const errors: { message: string; retryable: boolean }[] = [];
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, {
      ...collectingCallbacks(),
      onError: (e) => errors.push(e),
    });

    expect(errors[0]?.retryable).toBe(true);
  });
});

// ── P1.2 follow-up: 409 REQUEST_IN_PROGRESS / 503 SERVICE_TEMPORARILY_UNAVAILABLE ──

function jsonError(status: number, payload: Record<string, unknown>): Response {
  return { ok: false, status, json: async () => payload } as unknown as Response;
}

const BUSY = {
  error: "REQUEST_IN_PROGRESS",
  message: "طلبك السابق لا يزال قيد المعالجة.",
  retryable: true,
  retryAfterSeconds: 2,
};
const UNAVAILABLE = {
  error: "SERVICE_TEMPORARILY_UNAVAILABLE",
  message: "الخدمة غير متاحة مؤقتاً.",
  retryable: true,
  retryAfterSeconds: 5,
};

describe("autoRetryDelayMs", () => {
  it("uses the server's retryAfterSeconds", () => {
    expect(autoRetryDelayMs("REQUEST_IN_PROGRESS", 3)).toBe(3000);
  });
  it("falls back to the per-code default when the value is missing or not a number", () => {
    expect(autoRetryDelayMs("REQUEST_IN_PROGRESS", undefined)).toBe(2000);
    expect(autoRetryDelayMs("REQUEST_IN_PROGRESS", "2")).toBe(2000);
    expect(autoRetryDelayMs("SERVICE_TEMPORARILY_UNAVAILABLE", undefined)).toBe(5000);
  });
  it("clamps to 1..10 seconds", () => {
    expect(autoRetryDelayMs("REQUEST_IN_PROGRESS", 0)).toBe(1000);
    expect(autoRetryDelayMs("REQUEST_IN_PROGRESS", -5)).toBe(1000);
    expect(autoRetryDelayMs("REQUEST_IN_PROGRESS", 600)).toBe(10000);
    expect(autoRetryDelayMs("REQUEST_IN_PROGRESS", Number.NaN)).toBe(2000);
  });
});

describe("runChatStream — busy / unavailable auto-retry", () => {
  it("waits, resends the identical body, and streams once the lock is free", async () => {
    const encoder = new TextEncoder();
    const okReader = fakeReader([encoder.encode("hi")]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonError(409, BUSY))
      .mockResolvedValueOnce({ ok: true, status: 200, body: okReader } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn(async (_ms: number, _signal: AbortSignal) => true);

    const cb = collectingCallbacks();
    await runChatStream(
      { model: "gpt-4o", messages: [{ role: "user", content: "x" }] },
      new AbortController().signal,
      cb,
      { sleep },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0]?.[0]).toBe(2000);
    const bodies = fetchMock.mock.calls.map((c) => (c[1] as { body: string }).body);
    expect(bodies[0]).toBe(bodies[1]);
    expect(cb.calls).toEqual(["chunk", "done"]);
  });

  it("gives up after 3 retries of 409 and shows the server's own message as retryable", async () => {
    const fetchMock = vi.fn(async () => jsonError(409, BUSY));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn(async (_ms: number, _signal: AbortSignal) => true);

    const errors: { message: string; retryable: boolean }[] = [];
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, {
      ...collectingCallbacks(),
      onError: (e) => errors.push(e),
    }, { sleep });

    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 try + 3 retries
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(errors).toEqual([{ message: BUSY.message, retryable: true }]);
  });

  it("retries 503 SERVICE_TEMPORARILY_UNAVAILABLE exactly once, after the server's delay", async () => {
    const fetchMock = vi.fn(async () => jsonError(503, UNAVAILABLE));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn(async (_ms: number, _signal: AbortSignal) => true);

    const errors: { message: string; retryable: boolean }[] = [];
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, {
      ...collectingCallbacks(),
      onError: (e) => errors.push(e),
    }, { sleep });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0]?.[0]).toBe(5000);
    expect(errors).toEqual([{ message: UNAVAILABLE.message, retryable: true }]);
  });

  it("does not auto-retry when the status and code do not match the policy", async () => {
    const fetchMock = vi.fn(async () => jsonError(500, BUSY));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn(async (_ms: number, _signal: AbortSignal) => true);

    const cb = collectingCallbacks();
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, cb, { sleep });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(cb.calls).toEqual(["error"]);
  });

  it("does not auto-retry other errors (402 stays a single call)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonError(402, { error: "INSUFFICIENT_BALANCE", message: "رصيدك صفر." }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn(async (_ms: number, _signal: AbortSignal) => true);

    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal,
      collectingCallbacks(), { sleep });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("reports stopped, not error, and sends nothing more when Stop is pressed while waiting", async () => {
    const fetchMock = vi.fn(async () => jsonError(409, BUSY));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn(async (_ms: number, _signal: AbortSignal) => false); // aborted during the wait

    const cb = collectingCallbacks();
    await runChatStream({ model: "gpt-4o", messages: [] }, new AbortController().signal, cb, { sleep });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cb.calls).toEqual(["stopped"]);
  });

  it("the real sleep resolves false when the signal aborts mid-wait", async () => {
    const fetchMock = vi.fn(async () => jsonError(409, { ...BUSY, retryAfterSeconds: 10 }));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const cb = collectingCallbacks();
    const run = runChatStream({ model: "gpt-4o", messages: [] }, controller.signal, cb);
    await new Promise((r) => setTimeout(r, 20));
    controller.abort();
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cb.calls).toEqual(["stopped"]);
  });
});

/* ─────────────────────────────────────────────────────────────────────
 * P6.3a — structured (v2) stream. Everything below is opt-in: the tests
 * above run with no `streamV2` option and pin the old behaviour.
 * ───────────────────────────────────────────────────────────────────── */

function sseFrame(type: string, body: Record<string, unknown> = {}): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;
}
const text = (t: string) => sseFrame("content_block_delta", { index: 1, delta: { type: "text_delta", text: t } });
const think = (t: string) =>
  sseFrame("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: t } });
const tail = (stopReason = "end_turn") =>
  sseFrame("message_delta", { delta: { stopReason }, usage: { inputTokens: 1, outputTokens: 1, creditCost: 0 } }) +
  sseFrame("message_stop");

function v2Callbacks(): StreamCallbacks & { log: string[]; text: string; thinking: string; errors: string[] } {
  const log: string[] = [];
  const errors: string[] = [];
  const acc = { text: "", thinking: "" };
  return {
    log,
    errors,
    get text() {
      return acc.text;
    },
    get thinking() {
      return acc.thinking;
    },
    onChunk: (d) => {
      acc.text += d;
      log.push("text");
    },
    onThinking: (d: string) => {
      acc.thinking += d;
      log.push("thinking");
    },
    onStatus: (c: string) => log.push(`status:${c}`),
    onDone: () => log.push("done"),
    onStopped: () => log.push("stopped"),
    onPartial: () => log.push("partial"),
    onError: (e) => {
      errors.push(e.message);
      log.push("error");
    },
  };
}

function v2Response(chunks: Uint8Array[], contentType = "text/event-stream; charset=utf-8", opts?: Parameters<typeof fakeReader>[1]) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": contentType }),
    body: fakeReader(chunks, opts),
  } as unknown as Response;
}

const enc = (s: string) => new TextEncoder().encode(s);
const BODY = { model: "m", messages: [] };

describe("runChatStream — Accept header (P6.3a)", () => {
  it("sends Accept: application/vnd.aip.stream+v2 only when streamV2 is on", async () => {
    const fetchMock = vi.fn(async () => v2Response([enc(text("hi") + tail())]));
    vi.stubGlobal("fetch", fetchMock);

    await runChatStream(BODY, new AbortController().signal, v2Callbacks(), { streamV2: true });
    const on = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(on.headers).toEqual({ "Content-Type": "application/json", Accept: "application/vnd.aip.stream+v2" });

    fetchMock.mockClear();
    await runChatStream(BODY, new AbortController().signal, v2Callbacks());
    const off = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(off.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.stringify(off.headers)).not.toContain("Accept");

    fetchMock.mockClear();
    await runChatStream(BODY, new AbortController().signal, v2Callbacks(), { streamV2: false });
    const explicitOff = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(explicitOff.headers).toEqual({ "Content-Type": "application/json" });
  });
});

describe("runChatStream — v2 happy path (P6.3a)", () => {
  it("routes thinking, status and text to their own callbacks, in order, then done", async () => {
    const wire =
      sseFrame("message_start", { message: { id: "r", model: "m", role: "assistant" } }) +
      sseFrame("status", { code: "waiting" }) +
      sseFrame("content_block_start", { index: 0, contentBlock: { type: "thinking" } }) +
      think("let me ") +
      think("think") +
      sseFrame("content_block_stop", { index: 0 }) +
      sseFrame("content_block_start", { index: 1, contentBlock: { type: "text" } }) +
      text("Hel") +
      text("lo") +
      sseFrame("content_block_stop", { index: 1 }) +
      tail();
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(wire)])));

    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });

    expect(cb.log).toEqual(["status:waiting", "thinking", "thinking", "text", "text", "done"]);
    expect(cb.thinking).toBe("let me think");
    expect(cb.text).toBe("Hello");
  });

  it("trims the leading whitespace of the answer, including a whitespace-only first delta", async () => {
    const wire = think("t") + text("\n\n") + text("  \n") + text("\nHi there") + text("\n\nmore") + tail();
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(wire)])));

    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });

    expect(cb.text).toBe("Hi there\n\nmore"); // leading blank lines gone, inner ones kept
    expect(cb.log.filter((l) => l === "text")).toHaveLength(2); // the two whitespace-only deltas were swallowed
  });

  it("decodes Arabic split inside a character, and a frame split mid-line, across reads", async () => {
    const wire = think("نفكّر") + text("مرحبا بك") + tail();
    const bytes = enc(wire);
    // The frame JSON is ASCII up to the first Arabic letter, so the first byte
    // >= 0xC0 is the lead byte of a 2-byte sequence: cut right after it.
    const byteAt = bytes.findIndex((b) => b >= 0xc0) + 1;
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([bytes.slice(0, byteAt), bytes.slice(byteAt, byteAt + 7), bytes.slice(byteAt + 7)])));

    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });

    expect(cb.thinking).toBe("نفكّر");
    expect(cb.text).toBe("مرحبا بك");
    expect(cb.thinking + cb.text).not.toContain("\uFFFD");
    expect(cb.log.at(-1)).toBe("done");
  });

  it("ignores unknown events and tool_use blocks, and still finishes with done", async () => {
    const wire =
      sseFrame("brand_new_event", { x: 1 }) +
      sseFrame("content_block_start", { index: 0, contentBlock: { type: "tool_use", id: "t1", name: "search" } }) +
      sseFrame("content_block_delta", { index: 0, delta: { type: "input_json_delta", partialJson: '{"q":1}' } }) +
      sseFrame("content_block_stop", { index: 0 }) +
      text("answer") +
      tail("tool_use");
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(wire)])));

    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });

    expect(cb.log).toEqual(["text", "done"]);
    expect(cb.text).toBe("answer");
  });

  it("a reasoning-only reply that ends normally is done, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(think("only thoughts") + tail())])));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });
    expect(cb.log).toEqual(["thinking", "done"]);
  });
});

describe("runChatStream — v2 fallbacks and interruptions (P6.3a)", () => {
  it("reads a text/plain answer like the old stream even though v2 was requested", async () => {
    // e.g. an older api, or something in between that ignored the Accept header
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc("plain "), enc("text")], "text/plain; charset=utf-8")));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });
    expect(cb.text).toBe("plain text");
    expect(cb.log).toEqual(["text", "text", "done"]);
  });

  it("does not parse SSE when v2 was not requested, even if the body looks like SSE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(text("x") + tail())])));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb);
    expect(cb.text).toContain("event: content_block_delta"); // raw bytes, as the old reader always did
  });

  it("a response with no headers object (test double) is read as the old stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, body: fakeReader([enc("abc")]) }) as unknown as Response));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });
    expect(cb.text).toBe("abc");
  });

  it("becomes partial when the body ends without message_stop after some output", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(think("t") + text("half"))])));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });
    expect(cb.log).toEqual(["thinking", "text", "partial"]);
  });

  it("becomes partial when only reasoning arrived before the cut", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(think("t"))])));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });
    expect(cb.log).toEqual(["thinking", "partial"]);
  });

  it("becomes partial on a network drop mid-stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(text("some"))], undefined, { throwAfter: 1 })));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });
    expect(cb.log).toEqual(["text", "partial"]);
  });

  it("an interrupted stop reason with output is partial; the server's STREAM_INTERRUPTED error does not turn it into an error", async () => {
    const wire = text("cut off") + sseFrame("error", { code: "STREAM_INTERRUPTED", message: "x" }) + tail("interrupted");
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(wire)])));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });
    expect(cb.log).toEqual(["text", "partial"]);
  });

  it("an interrupted stream with no output at all is an error that carries the server's message and is retryable", async () => {
    const wire = sseFrame("error", { code: "STREAM_INTERRUPTED", message: "Upstream broke" }) + tail("interrupted");
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(wire)])));
    const cb = v2Callbacks();
    let retryable: boolean | undefined;
    await runChatStream(BODY, new AbortController().signal, { ...cb, onError: (e) => { retryable = e.retryable; cb.onError(e); } }, { streamV2: true });
    expect(cb.log).toEqual(["error"]);
    expect(cb.errors).toEqual(["Upstream broke"]);
    expect(retryable).toBe(true);
  });

  it("an empty v2 body is an error, not a silent done", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([])));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });
    expect(cb.log).toEqual(["error"]);
  });

  it("abort mid-stream is stopped, not partial or error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => v2Response([enc(think("t"))], undefined, { throwAfter: 1, throwAsAbort: true })));
    const cb = v2Callbacks();
    await runChatStream(BODY, new AbortController().signal, cb, { streamV2: true });
    expect(cb.log).toEqual(["thinking", "stopped"]);
  });

  it("an HTTP error still takes the JSON error path when v2 was requested", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 402,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ error: "INSUFFICIENT_BALANCE", message: "No credits" }),
      }) as unknown as Response),
    );
    const cb = v2Callbacks();
    let retryable: boolean | undefined;
    await runChatStream(BODY, new AbortController().signal, { ...cb, onError: (e) => { retryable = e.retryable; cb.onError(e); } }, { streamV2: true });
    expect(cb.errors).toEqual(["No credits"]);
    expect(retryable).toBe(false);
  });
});
