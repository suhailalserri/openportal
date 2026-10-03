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
import { createStreamV2Parser, type StreamV2Event } from "./stream-v2-parser";
import { STREAM_V2_MEDIA_TYPE } from "./stream-mode";

export interface ChatStreamRequestBody {
  model: string;
  // "system" removed from the client's own role union — the server no
  // longer accepts it here at all (chat.schema.ts); the system layer is
  // assembled entirely server-side now (gateway.service.ts).
  messages: { role: "user" | "assistant"; content: string }[];
  conversationId?: string | undefined;
  /** P6.3c. Ready attachments to use in THIS turn (max 5, all in `conversationId`). Omitted when none. */
  attachmentIds?: string[] | undefined;
  // Phase 4c — all optional on the server (apps/api/src/schemas/
  // chat.schema.ts, B1). Each is OMITTED from the JSON when unset: the
  // server's Zod schema is `.optional()`, not `.nullable()`, so a
  // literal `null` on the wire would 400. Widened with `| undefined` for
  // the same exactOptionalPropertyTypes reason as `conversationId` above.
  temperature?: number | undefined;
  top_p?: number | undefined;
  max_tokens?: number | undefined;
  /** P6.6. Omitted for "model default"; the api ignores it for a model without the `reasoning` flag. */
  reasoningEffort?: "low" | "medium" | "high" | undefined;
  /** P6.6. Never sent while the search control is hidden (lib/request-options.ts). */
  webSearch?: boolean | undefined;
}

export interface StreamCallbacks {
  onChunk: (delta: string) => void;
  /** P6.3a, v2 stream only. Reasoning text; never called on the plain-text stream. */
  onThinking?: ((delta: string) => void) | undefined;
  /** P6.3a, v2 stream only. A progress code (today just "waiting"); the UI picks its own wording. */
  onStatus?: ((code: string) => void) | undefined;
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
  /** P6.3a. Ask for the structured v2 stream (sends `Accept`). Off by default: every
   *  request without it is byte-identical to before. The caller passes the admin's
   *  Thinking switch (hooks/use-feature-flags.ts), so this file stays free of storage. */
  streamV2?: boolean | undefined;
}

/**
 * P6.3a. Reads a v2 (SSE) body to its end and reports what happened.
 *
 * LEADING WHITESPACE: the first text delta of a reply is often just "\n\n" (seen
 * live on openrouter/free, Session 47). Text is held back until it has a
 * non-whitespace character, and that character's leading whitespace is cut, so
 * the answer never starts with blank lines. Done here, not in the reducer,
 * because the reducer's CHUNK action is shared with the plain-text stream,
 * which must stay byte-identical.
 *
 * `complete` is true only when `message_stop` arrived and the stop reason is not
 * "interrupted". A body that ends without `message_stop` (connection dropped) is
 * NOT complete, same as a thrown read error on the old stream.
 */
async function consumeV2(
  reader: { read: () => Promise<{ done: boolean; value?: Uint8Array | undefined }> },
  decoder: TextDecoder,
  callbacks: StreamCallbacks,
  onProgress: () => void,
): Promise<{ complete: boolean; error: { code: string; message: string } | null }> {
  const parser = createStreamV2Parser();
  let textStarted = false;
  let sawEnd = false;
  let stopReason: string = "unknown";
  let error: { code: string; message: string } | null = null;

  const handle = (events: StreamV2Event[]): void => {
    for (const ev of events) {
      switch (ev.type) {
        case "text": {
          let text = ev.text;
          if (!textStarted) {
            text = text.replace(/^\s+/, "");
            if (text.length === 0) break;
            textStarted = true;
          }
          onProgress();
          callbacks.onChunk(text);
          break;
        }
        case "thinking":
          onProgress();
          callbacks.onThinking?.(ev.text);
          break;
        case "status":
          callbacks.onStatus?.(ev.code);
          break;
        case "error":
          error = { code: ev.code, message: ev.message };
          break;
        case "stop":
          stopReason = ev.stopReason;
          break;
        case "end":
          sawEnd = true;
          break;
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    handle(parser.push(decoder.decode(value, { stream: true })));
  }
  handle(parser.push(decoder.decode())); // flush a trailing partial sequence
  handle(parser.finish()); // and a CR line ending that was waiting for a possible LF

  return { complete: sawEnd && stopReason !== "interrupted", error };
}

/** The response's Content-Type, tolerating a test double with no `headers`. */
function contentTypeOf(response: Response): string {
  try {
    return (response as { headers?: Headers }).headers?.get("content-type") ?? "";
  } catch {
    return "";
  }
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
        headers: options.streamV2
          ? { "Content-Type": "application/json", Accept: STREAM_V2_MEDIA_TYPE }
          : { "Content-Type": "application/json" },
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

  // v2 only when it was asked for AND the server actually answered with it: a
  // server that ignores the header (older api, a proxy in between) replies
  // text/plain, and that is then read exactly like the old stream.
  const isV2 = options.streamV2 === true && contentTypeOf(response).toLowerCase().startsWith("text/event-stream");

  try {
    if (isV2) {
      const outcome = await consumeV2(reader, decoder, callbacks, () => {
        receivedAny = true;
      });
      if (outcome.complete) {
        callbacks.onDone();
      } else if (receivedAny) {
        callbacks.onPartial();
      } else {
        callbacks.onError({
          message: outcome.error?.message || "Connection lost before any response arrived.",
          retryable: true,
        });
      }
      return;
    }
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
