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
