/**
 * apps/web/features/chat/lib/new-chat.ts
 *
 * Phase 4d. Exactly one job: decide the id and the destination URL for a
 * brand-new conversation, at the moment the person sends their first
 * message from the empty `/chat` state.
 *
 * WHY THE CLIENT GENERATES THE ID (read before changing this):
 * `POST /api/chat`'s `conversationId` is optional in its schema, and if
 * omitted the SERVER falls back to `body.conversationId ?? crypto.
 * randomUUID()` (apps/api/src/index.ts) — but that generated id is never
 * returned to the caller: the response is a plain-text SSE-less stream
 * body, no header carries it back. If the UI ever called
 * `POST /api/chat` without an id already in hand, the row that insert
 * creates would be permanently unreachable (no URL, no sidebar entry
 * pointing at it), and pressing Enter again on what LOOKS like "the same
 * conversation" would mint a second, different server-side id — silently
 * forking one chat into two orphaned rows with no error, no crash, and
 * nothing in the UI to indicate it happened.
 *
 * So: the id is generated HERE, client-side, before the first
 * `useChatStream({ conversationId, ... }).send()` call, and the caller
 * (chat-view.tsx, via the /chat page's onFirstSend) navigates to
 * `/chat/[id]` with that same id BEFORE or synchronously alongside
 * calling `send()` — never after. This is also exactly what gives the
 * "message appears to send instantly, URL updates to reflect it" UX
 * users expect from every mainstream chat product; the correctness fix
 * and the desired UX are the same one line of code, not a tradeoff.
 *
 * `POST /api/conversations` (the real conversation-row create endpoint)
 * is NOT called here, deliberately: gateway.service.ts's own insert path
 * already uses `onConflictDoNothing()` keyed on the id the client sends
 * with the first `POST /api/chat` (conversation-api.ts's header comment,
 * "first write wins"), so a separate pre-create call would either race
 * that insert or be redundant with it. `POST /api/conversations` exists
 * for a DIFFERENT purpose this phase also uses — see
 * conversation-api.ts's `createConversation` — but starting a chat from
 * the composer's first send does not need it.
 */

/** A UUID v4 string, or a fallback with the same shape for a runtime
 *  without `crypto.randomUUID` (very old browsers / non-secure-context
 *  edge cases). Not cryptographically strong in the fallback branch —
 *  fine here, since this id only ever needs to be UNIQUE, not
 *  unguessable (it becomes a URL segment and a foreign key the server
 *  re-validates ownership of on every request regardless). */
export function generateConversationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // RFC 4122-shaped, not RFC 4122-compliant randomness — see the
  // function doc comment above for why that's an acceptable tradeoff
  // here specifically.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Locale-prefixed path for a (possibly brand-new) conversation. Kept as
 *  a pure function so the "what does the URL look like" decision is
 *  unit-testable without a router. */
export function conversationPath(locale: string, conversationId: string): string {
  return `/${locale}/chat/${conversationId}`;
}
