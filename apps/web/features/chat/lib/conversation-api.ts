/**
 * apps/web/features/chat/lib/conversation-api.ts
 *
 * Phase 4c. The two conversation-row calls the composer needs, isolated
 * from React so they can be tested with a fake `fetch`.
 *
 * CONTRACT (read from the code, not assumed):
 *  - GET   /api/conversations/[id]  → the full row `{ ...conv, messages }`
 *    (apps/web/app/api/conversations/[id]/route.ts). `systemPrompt` is
 *    only available here — the LIST endpoint's `columns` omit it.
 *  - PATCH /api/conversations/[id]  body `{ systemPrompt?: string }`
 *    → `{ success: true }`. `""` clears; omitting the key leaves it alone.
 *    B1 added this field. It returns success even when no row matched the
 *    `(id, userId)` filter (the UPDATE simply affects 0 rows) — so a
 *    `success: true` does NOT prove the row exists or belongs to the
 *    caller. We treat it as "the server accepted the request", nothing more.
 *
 * WHEN EACH IS USED — the lazy-create nuance: a brand-new conversation
 * has no row until the first POST /api/chat, which inserts it with
 * `onConflictDoNothing()` (gateway.service.ts, "first write wins"). So:
 *   - before the first send: the system prompt only needs to ride along
 *     on the /api/chat body (use-chat-stream.ts) — there is nothing to PATCH;
 *   - once the row exists: a changed prompt must be PATCHed, because the
 *     insert will NOT overwrite it on later sends.
 */
import type { ConversationSummary } from "../types";

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; unauthorized: boolean };

export async function fetchConversationSystemPrompt(
  conversationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<string>> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      credentials: "include",
    });
  } catch {
    return { ok: false, status: 0, unauthorized: false };
  }
  if (!res.ok) return { ok: false, status: res.status, unauthorized: res.status === 401 };
  try {
    const body = (await res.json()) as { systemPrompt?: string | null };
    return { ok: true, value: body.systemPrompt ?? "" };
  } catch {
    return { ok: false, status: res.status, unauthorized: false };
  }
}

export async function patchConversationSystemPrompt(
  conversationId: string,
  systemPrompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<true>> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt }),
    });
  } catch {
    return { ok: false, status: 0, unauthorized: false };
  }
  if (!res.ok) return { ok: false, status: res.status, unauthorized: res.status === 401 };
  return { ok: true, value: true };
}

/**
 * Phase 4d. Added next to the existing get/patch-system-prompt calls
 * above. All four follow the same shape (`credentials: "include"`, the
 * same `ApiResult<T>` envelope, a `fetchImpl` param defaulting to real
 * `fetch` so use-conversations.test.ts — when it lands — can inject a
 * fake) so the sidebar hook has one consistent error-handling pattern
 * to branch on, matching fetchConversationSystemPrompt's own contract.
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
