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
