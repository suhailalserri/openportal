/**
 * apps/web/features/chat/lib/conversation-api.ts
 *
 * Phase 4c. The two conversation-row calls the composer needs, isolated
 * from React so they can be tested with a fake `fetch`.
 *
 * CONTRACT (read from the code, not assumed):
 *  - GET   /api/conversations/[id]  → the full row `{ ...conv, messages }`
 *    (apps/web/app/api/conversations/[id]/route.ts).
 *  - PATCH /api/conversations/[id]  body `{ title? }` / `{ isPinned? }`
 *    → `{ success: true }`. There is no per-conversation system prompt
 *    anymore — that was fully user/client-controlled and has been removed
 *    entirely (see packages/db/src/migrations/0014_*.sql); any "rules"
 *    the assistant follows now come from the server-owned platform/model
 *    prompts assembled in gateway.service.ts, which nothing on the client
 *    reads, sets, or overrides.
 */
import type { ChatMessage, ConversationSummary, ThinkingTrace } from "../types";

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; unauthorized: boolean };

/**
 * All four functions below follow the same shape (`credentials: "include"`,
 * the same `ApiResult<T>` envelope, a `fetchImpl` param defaulting to real
 * `fetch` so tests can inject a fake) for one consistent error-handling
 * pattern.
 *
 * CONTRACT (read from apps/web/app/api/conversations/route.ts and
 * conversations/[id]/route.ts — both frozen-zone, read-only here):
 *  - GET  /api/conversations       → `{ items: ConversationSummary[] }`,
 *    newest-updated first, capped at 50, soft-deleted rows already
 *    filtered server-side.
 *  - PATCH /api/conversations/[id] body `{ title? }` / `{ isPinned? }`
 *    → `{ success: true }` (same "accepted, not existence-proof"
 *    caveat as patchConversationSystemPrompt above — an id that isn't
 *    the caller's own silently affects zero rows, not a 404).
 *  - DELETE /api/conversations/[id] → `{ success: true }`, soft-delete
 *    (`deletedAt` set) — the row is not physically removed, matching
 *    the schema's soft-delete column and pg_cron's later archival pass
 *    (master plan Phase 5.3), not this endpoint's concern.
 */
export async function listConversations(
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<ConversationSummary[]>> {
  let res: Response;
  try {
    res = await fetchImpl("/api/conversations", { credentials: "include" });
  } catch {
    return { ok: false, status: 0, unauthorized: false };
  }
  if (!res.ok) return { ok: false, status: res.status, unauthorized: res.status === 401 };
  try {
    const body = (await res.json()) as { items: ConversationSummary[] };
    return { ok: true, value: body.items };
  } catch {
    return { ok: false, status: res.status, unauthorized: false };
  }
}

async function patchConversation(
  conversationId: string,
  patch: { title?: string } | { isPinned?: boolean },
  fetchImpl: typeof fetch,
): Promise<ApiResult<true>> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    return { ok: false, status: 0, unauthorized: false };
  }
  if (!res.ok) return { ok: false, status: res.status, unauthorized: res.status === 401 };
  return { ok: true, value: true };
}

export async function renameConversation(
  conversationId: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<true>> {
  return patchConversation(conversationId, { title }, fetchImpl);
}

export async function pinConversation(
  conversationId: string,
  isPinned: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<true>> {
  return patchConversation(conversationId, { isPinned }, fetchImpl);
}

export async function deleteConversation(
  conversationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<true>> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    return { ok: false, status: 0, unauthorized: false };
  }
  if (!res.ok) return { ok: false, status: res.status, unauthorized: res.status === 401 };
  return { ok: true, value: true };
}

/**
 * Phase 4d. `/chat/[id]`'s history loader (use-conversation-messages.ts)
 * calls this. Reuses the same GET this file's `fetchConversationSystemPrompt`
 * already hits (`GET /api/conversations/[id]` → `{ ...conv, messages }`,
 * `apps/web/app/api/conversations/[id]/route.ts`, frozen/read-only) —
 * deliberately a SECOND function rather than teaching that one to also
 * return messages, because the two callers want different slices of the
 * same response and `fetchConversationSystemPrompt`'s existing callers
 * (use-chat-params.ts) have no reason to pull the message array over the
 * wire too.
 *
 * ROW SHAPE MAPPING: the route's `messages` array is `@ai-platform/db`'s
 * `Message` row shape (packages/db/src/schema/messages.ts) serialized
 * through `NextResponse.json` — `createdAt` arrives as an ISO string
 * (Date → JSON), and nullable columns (`feedback`, `modelId`,
 * `inputTokens`, `outputTokens`, `creditCost`) arrive as `null`, not
 * `undefined`. `ChatMessage` (types.ts) models every one of those as an
 * OPTIONAL field, not `T | null` — this repo's `exactOptionalPropertyTypes`
 * means a bare pass-through of `null` into an optional field is a type
 * error, and more importantly a `ChatMessage` with `feedback: null` is
 * not the same representable state 4b's reducer/ErrorMessage code was
 * written against (`feedback?: "positive" | "negative"`, i.e. absent-or-
 * one-of-two, never `null`). `mapRow` below is the one conversion point
 * (same rule as `createdAt`'s own doc comment) that turns `null` into
 * "key omitted".
 *
 * 404-AS-EMPTY: a conversation id with no server row yet — the gap
 * between new-chat.ts generating an id/navigating and gateway.service.ts's
 * lazy `onConflictDoNothing()` insert actually landing on the first send
 * — is NOT an error from this hook's caller's point of view: chat-view.tsx
 * mounts `ChatSession` with `conversationId` already set (the URL has
 * navigated) before that insert has necessarily happened, and its very
 * first `useConversationMessages` call must not flash an error state for
 * a conversation that simply doesn't exist YET. A 404 is therefore mapped
 * to `{ ok: true, value: [] }` here, not `{ ok: false }` — deliberately
 * different from every other function in this file, where 404 is an
 * ordinary failure. A REAL, unexpected 404 (a stale/bad id typed into the
 * URL bar directly) still resolves to "no messages", which is also the
 * correct rendering for that case (an empty transcript, not a crash) —
 * the two situations are visually indistinguishable on purpose.
 */
interface ConversationRow {
  messages: Array<{
    id: string;
    role: ChatMessage["role"];
    content: string;
    createdAt: string;
    isPartial: boolean;
    feedback: "positive" | "negative" | null;
    modelId: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    creditCost: number | null;
    /** P6.4: ordered blocks of a v2 reply; null/absent for older rows and v1 replies. */
    contentBlocks?: unknown;
  }>;
}

/**
 * P6.4. Rebuilds the Thinking trace of a saved reply from `contentBlocks`.
 *
 * Tolerant on purpose (the column is `jsonb`, written by another service): anything that is not an
 * array, and any block that is not a well-formed `thinking` block, is ignored, so a bad or future
 * row can never break the history load. A reply with several thinking blocks (reasoning around a
 * tool call) shows them as one trace, joined by a blank line, with their durations added up.
 *
 * `startedAt`/`endedAt` are RELATIVE here (0 and the total duration): ThinkingBlock only ever uses
 * their difference for "Thought for Ns", and a saved reply has no live clock. Without a stored
 * duration `endedAt` stays undefined, which renders the label without a time.
 */
export function thinkingFromBlocks(blocks: unknown): ThinkingTrace | undefined {
  if (!Array.isArray(blocks)) return undefined;
  const texts: string[] = [];
  let durationMs = 0;
  let hasDuration = false;
  for (const b of blocks) {
    if (typeof b !== "object" || b === null) continue;
    const block = b as { type?: unknown; thinking?: unknown; durationMs?: unknown };
    if (block.type !== "thinking" || typeof block.thinking !== "string" || block.thinking.trim() === "") continue;
    texts.push(block.thinking);
    if (typeof block.durationMs === "number" && Number.isFinite(block.durationMs) && block.durationMs >= 0) {
      durationMs += block.durationMs;
      hasDuration = true;
    }
  }
  if (texts.length === 0) return undefined;
  return { text: texts.join("\n\n"), startedAt: 0, endedAt: hasDuration ? durationMs : undefined };
}

function mapRow(row: ConversationRow["messages"][number]): ChatMessage {
  const thinking = thinkingFromBlocks(row.contentBlocks);
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
    isPartial: row.isPartial,
    ...(row.feedback != null ? { feedback: row.feedback } : {}),
    ...(row.modelId != null ? { modelId: row.modelId } : {}),
    ...(row.inputTokens != null ? { inputTokens: row.inputTokens } : {}),
    ...(row.outputTokens != null ? { outputTokens: row.outputTokens } : {}),
    ...(row.creditCost != null ? { creditCost: row.creditCost } : {}),
    ...(thinking !== undefined ? { thinking } : {}),
  };
}

/**
 * Phase 4d patch. Same GET this file's `fetchConversationSystemPrompt`
 * and `fetchConversationMessages` already hit, for the same reason those
 * two are separate functions rather than one widened response (see this
 * file's earlier header comment): `use-conversation-messages.ts` wants
 * the conversation's own `modelId` alongside its messages, and the two
 * existing functions' callers have no reason to also receive it.
 *
 * `modelId` is `string | null` on the `conversations` row (not `.notNull()`
 * — packages/db/src/schema/conversations.ts) for a conversation that has
 * never had a message sent in it yet. Mapped to `string | undefined` here,
 * matching every other nullable-column mapping in this file
 * (`mapRow` above) and `ChatModel`'s own optional convention.
 */
export async function fetchConversationModelId(
  conversationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<string | undefined>> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      credentials: "include",
    });
  } catch {
    return { ok: false, status: 0, unauthorized: false };
  }
  // Mirrors fetchConversationMessages's 404-as-empty handling: a
  // not-yet-created conversation has no modelId yet either, which is a
  // valid "undefined" state here, not a failure.
  if (res.status === 404) return { ok: true, value: undefined };
  if (!res.ok) return { ok: false, status: res.status, unauthorized: res.status === 401 };
  try {
    const body = (await res.json()) as { modelId?: string | null };
    return { ok: true, value: body.modelId ?? undefined };
  } catch {
    return { ok: false, status: res.status, unauthorized: false };
  }
}

export async function fetchConversationMessages(
  conversationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<ChatMessage[]>> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      credentials: "include",
    });
  } catch {
    return { ok: false, status: 0, unauthorized: false };
  }
  if (res.status === 404) return { ok: true, value: [] }; // see header comment: not-yet-created is not a failure
  if (!res.ok) return { ok: false, status: res.status, unauthorized: res.status === 401 };
  try {
    const body = (await res.json()) as ConversationRow;
    return { ok: true, value: body.messages.map(mapRow) };
  } catch {
    return { ok: false, status: res.status, unauthorized: false };
  }
}
