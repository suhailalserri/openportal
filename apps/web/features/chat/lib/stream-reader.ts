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
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  conversationId?: string | undefined;
}

export interface StreamCallbacks {
  onChunk: (delta: string) => void;
  onDone: () => void;
  onStopped: () => void;
  onPartial: () => void;
  onError: (error: { message: string; retryable: boolean; redirectTo?: string }) => void;
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

export async function runChatStream(
  body: ChatStreamRequestBody,
  signal: AbortSignal,
  callbacks: StreamCallbacks,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  if (!response.ok) {
    if (response.status === 401) {
      callbacks.onError({ message: "unauthorized", retryable: false, redirectTo: "/auth/login" });
      return;
    }
    let parsed: { error?: string; message?: string; redirectTo?: string } = {};
    try {
      parsed = (await response.json()) as typeof parsed;
    } catch {
      // Non-JSON error body (e.g. an upstream proxy's own HTML error
      // page) — fall through to a generic message rather than throwing.
    }
    callbacks.onError({
      message: parsed.message ?? "Something went wrong. Please try again.",
      retryable: !NOT_RETRYABLE.has(parsed.error ?? ""),
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
