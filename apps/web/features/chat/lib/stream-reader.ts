/**
 * apps/web/features/chat/lib/stream-reader.ts
 *
 * Phase 4b. The one place that actually calls `fetch("/api/chat")` and
 * reads the response body — kept separate from chat-stream-reducer.ts
 * (pure) and use-chat-stream.ts (React lifecycle) so this file's own
 * test (stream-reader.test.ts) can drive it with a fake `Response`-like
 * object and a fake reader, with no real network and no React involved.
 *
 * CHAT CONTRACT (Phase 4's own note, not re-derived here): POST
 * `{ model, messages[{role,content}], conversationId? }` → `text/plain`
 * content deltas on success, or a JSON error body `{ error, message,
 * status?, redirectTo? }` on failure — `app/api/chat/route.ts` (frozen)
 * forwards both as-is from the Fastify service.
 *
 * DECODING: one `TextDecoder` instance is reused across every chunk in
 * the loop, and every `.decode()` call (including the final flush) uses
 * `{ stream: true }` except the last. A UTF-8 multi-byte sequence (every
 * Arabic character is 2 bytes) can legitimately land split across two
 * separate `read()` results — a new decoder per chunk, or omitting
 * `stream: true`, would silently corrupt exactly that byte sequence
 * into replacement characters. stream-reader.test.ts's split-character
 * case exists specifically to catch a regression here.
 */
export interface ChatStreamRequestBody {
  model: string;
  // "system" removed from the client's own role union — the server no
  // longer accepts it here at all (chat.schema.ts); the system layer is
  // assembled entirely server-side now (gateway.service.ts).
  messages: { role: "user" | "assistant"; content: string }[];
  conversationId?: string | undefined;
  // Phase 4c — all optional on the server (apps/api/src/schemas/
  // chat.schema.ts, B1). Each is OMITTED from the JSON when unset: the
  // server's Zod schema is `.optional()`, not `.nullable()`, so a
  // literal `null` on the wire would 400. Widened with `| undefined` for
  // the same exactOptionalPropertyTypes reason as `conversationId` above.
  temperature?: number | undefined;
  top_p?: number | undefined;
  max_tokens?: number | undefined;
}

export interface StreamCallbacks {
  onChunk: (delta: string) => void;
  onDone: () => void;
  onStopped: () => void;
  onPartial: () => void;
  // redirectTo widened to `string | undefined`, not just optional `string`:
  // this repo's tsconfig has exactOptionalPropertyTypes: true, which treats
  // "key absent" and "key present but undefined" as different types. The
  // one call site that sets this field (below, from the parsed JSON error
  // body) reads it via `parsed.redirectTo`, which is `string | undefined`
  // even though `parsed`'s own type declares it as `redirectTo?: string` —
  // passing that explicit `string | undefined` value into a plain `string`-
  // optional target field is exactly what that flag forbids. Same class of
  // bug as ChatError.redirectTo in features/chat/types.ts (4b) and every
  // prior `exactOptionalPropertyTypes` fix logged in
  // docs/frontend/BRANCH_AND_CI_NOTES.md (3.1 rounds 1–3, B1 hotfix #1).
  onError: (error: { message: string; retryable: boolean; redirectTo?: string | undefined }) => void;
}

/**
 * Whether a regenerate/retry affordance makes sense for a given gateway
 * error code (Phase 7.1's ERROR_MESSAGES map, mirrored client-side only
 * as a retryable/not split — the actual Arabic/English copy always
 * comes from the JSON body's own `message`, never re-translated here).
 * Codes absent from this map default to retryable: an error the client
 * doesn't specifically recognize is far more likely a transient gateway
 * hiccup than a permanent one.
 */
const NOT_RETRYABLE = new Set([
  "INSUFFICIENT_BALANCE",
  "CONTEXT_TOO_LONG",
  "MODEL_NOT_FOUND",
  "CONFIG_ERROR",
  "UPSTREAM_ROUTE_NOT_FOUND",
]);

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

/**
 * P1.2 follow-up. The API rejects a second billed `/chat` from the same user
 * while the first is still streaming or being billed (409), and fails closed
 * when its lock store is unreachable (503). Both are rejected BEFORE any
 * provider call and before any row is written, so resending the identical
 * body is safe and inserts nothing twice. The wait comes from the JSON body's
 * `retryAfterSeconds` (the frozen `/api/chat` proxy does not forward the
 * `Retry-After` header), clamped so a bad value can neither spin nor hang.
 * Attempts are bounded; when they run out the server's own message is shown
 * with the normal retry button.
 */
const AUTO_RETRY: Record<string, { status: number; max: number; defaultSeconds: number }> = {
  REQUEST_IN_PROGRESS:             { status: 409, max: 3, defaultSeconds: 2 },
  SERVICE_TEMPORARILY_UNAVAILABLE: { status: 503, max: 1, defaultSeconds: 5 },
};
const MIN_WAIT_SECONDS = 1;
const MAX_WAIT_SECONDS = 10;

export function autoRetryDelayMs(code: string, retryAfterSeconds: unknown): number {
  const policy = AUTO_RETRY[code];
  const fallback = policy ? policy.defaultSeconds : MIN_WAIT_SECONDS;
  const seconds =
    typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds
      : fallback;
  return Math.min(MAX_WAIT_SECONDS, Math.max(MIN_WAIT_SECONDS, seconds)) * 1000;
}

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RunChatStreamOptions {
  /** Test seam. Must resolve false if `signal` aborts while waiting. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<boolean>;
}

export async function runChatStream(
  body: ChatStreamRequestBody,
  signal: AbortSignal,
  callbacks: StreamCallbacks,
  options: RunChatStreamOptions = {},
): Promise<void> {
  const sleep = options.sleep ?? abortableSleep;
  const autoRetries: Record<string, number> = {};
  let response: Response;

  for (;;) {
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // JSON.stringify drops keys whose value is `undefined`, so unset
        // optional params never reach the wire (see the interface comment).
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) {
        callbacks.onStopped();
        return;
      }
      callbacks.onError({ message: "network", retryable: true });
      return;
    }

    if (response.ok) break;

    if (response.status === 401) {
      callbacks.onError({ message: "unauthorized", retryable: false, redirectTo: "/auth/login" });
      return;
    }
    let parsed: { error?: string; message?: string; redirectTo?: string; retryAfterSeconds?: number } = {};
    try {
      parsed = (await response.json()) as typeof parsed;
    } catch {
      // Non-JSON error body (e.g. an upstream proxy's own HTML error
      // page) — fall through to a generic message rather than throwing.
    }

    const code = parsed.error ?? "";
    const policy = AUTO_RETRY[code];
    if (policy && policy.status === response.status && (autoRetries[code] ?? 0) < policy.max) {
      autoRetries[code] = (autoRetries[code] ?? 0) + 1;
      const waited = await sleep(autoRetryDelayMs(code, parsed.retryAfterSeconds), signal);
      if (!waited || signal.aborted) {
        callbacks.onStopped();
        return;
      }
      continue;
    }

    callbacks.onError({
      message: parsed.message ?? "Something went wrong. Please try again.",
      retryable: !NOT_RETRYABLE.has(code),
      redirectTo: parsed.redirectTo,
    });
    return;
  }

  const stream = response.body;
  if (!stream) {
    callbacks.onError({ message: "Empty response from the server.", retryable: true });
    return;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let receivedAny = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Fires per chunk, immediately — no accumulation into a buffer
      // that only gets flushed once the stream ends.
      const text = decoder.decode(value, { stream: true });
      if (text.length > 0) {
        receivedAny = true;
        callbacks.onChunk(text);
      }
    }
    const tail = decoder.decode(); // flush any trailing partial sequence
    if (tail.length > 0) callbacks.onChunk(tail);
    callbacks.onDone();
  } catch (err) {
    if (signal.aborted || isAbortError(err)) {
      callbacks.onStopped();
      return;
    }
    if (receivedAny) {
      callbacks.onPartial();
    } else {
      callbacks.onError({ message: "Connection lost before any response arrived.", retryable: true });
    }
  }
}
