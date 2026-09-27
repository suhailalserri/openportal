/**
 * apps/web/features/chat/types.ts
 *
 * Reconciles the two message shapes that existed before this phase:
 *  - the deleted components/chat/message-bubble.tsx's local,
 *    presentational-only `ChatMessage` — built ahead of its real phase,
 *    per that file's own header comment ("whoever wires this up for
 *    real ... should reconcile the two").
 *  - the real persisted row: `@ai-platform/db`'s `messages` table
 *    (role/content/inputTokens/outputTokens/creditCost/modelId/
 *    isPartial/feedback/createdAt — packages/db/src/schema/messages.ts).
 *
 * `ChatMessage` below is a trimmed, RENDER-facing view of that row — a
 * plain, serializable shape, not the Drizzle `$inferSelect` type itself
 * (which also carries `conversationId`/`gatewayRequestId`/`id` as a
 * branded uuid type that rendering never needs).
 *
 * Deliberately does NOT model "error" as a role or a flag on this type.
 * B1's `streamChat` (apps/api/src/services/gateway.service.ts) never
 * inserts a row when the gateway errors — it replies with a JSON error
 * and returns, nothing persisted. A gateway error is therefore `ChatError`
 * below: a separate, non-persisted, transient render state that a
 * message LIST may show in the assistant turn's slot, never mixed into
 * the same array as a real `ChatMessage`. 4b (the stream reducer) is
 * what actually decides when one appears.
 */

export type ChatMessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  /** ISO 8601. Formatted at render time via lib/format.ts (formatRelativeDate)
   *  — this type never carries a formatted string, same "one conversion
   *  point" rule Rule 1 applies to money, applied here to dates too. */
  createdAt: string;
  /** True when the stream was cut off before completion (network drop,
   *  client disconnect, server restart mid-generation) — persisted
   *  as-is from the `messages.is_partial` column. */
  isPartial: boolean;
  feedback?: "positive" | "negative" | undefined;
  /** The following four are only ever set on an assistant turn — the
   *  gateway fills them in after the stream finishes (B1's
   *  `deductCreditsAtomic` + `saveMessageBackground`). Modeled as
   *  optional rather than splitting into separate User/Assistant
   *  interfaces because 4b's stream reducer builds a message
   *  INCREMENTALLY: `content` arrives token by token before `creditCost`
   *  is known at all, so "assistant message, cost not known yet" has to
   *  be a representable, valid state of this same type. */
  modelId?: string | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  /** Micro-credits — same unit as everywhere else in the app. Passed
   *  through formatCredits() at render time, never computed here. */
  creditCost?: number | undefined;
}

/** A gateway/network error surfaced in the assistant turn's slot —
 *  rendered by ErrorMessage, never stored as a ChatMessage (see this
 *  file's header comment). `retryable` distinguishes "show a regenerate
 *  button" (most gateway errors — B1's ERROR_MESSAGES map: 429/503/500)
 *  from a hard stop like INSUFFICIENT_BALANCE, which routes to /billing
 *  instead of offering a retry — that routing decision belongs to 4b,
 *  not to this type or to ErrorMessage itself. */
export interface ChatError {
  id: string;
  message: string;
  retryable: boolean;
  /** Set only for a 401 mid-stream (stream-reader.ts maps it to
   *  retryable: false + this field, per the chat contract's `redirectTo`
   *  on the JSON error body). The caller — not this type, not the
   *  reducer, not ErrorMessage — is responsible for sanitizing this
   *  through lib/safe-redirect.ts's sanitizeNext() before navigating;
   *  it is untrusted the same way any server-supplied redirect target
   *  is (Rule 4). Added in 4b, additive/optional — does not change
   *  4a's ErrorMessage, which simply doesn't read it. */
  redirectTo?: string | undefined;
}

/**
 * Phase 4c. The three numeric generation parameters the user can set per
 * conversation. `null` means "not set — let the model/provider default
 * apply" and is deliberately NOT sent on the wire (see
 * stream-reader.ts's request-body builder), because sending a default
 * value explicitly would override a provider's own default that may differ
 * per model.
 *
 * `null` (not `undefined`) is used so the "unset" state is an explicit,
 * serialisable value: this repo's tsconfig has `exactOptionalPropertyTypes:
 * true`, under which an optional field can't be assigned `undefined`
 * without widening — an explicit `number | null` sidesteps that whole
 * class of build failure (see docs/frontend/BRANCH_AND_CI_NOTES.md,
 * B1 hotfix #1 and 4b's rounds 1-2).
 *
 * `systemPrompt` used to be here, persisted server-side and user-editable.
 * It's been removed entirely (product decision — users don't get a custom
 * system prompt); the server now assembles its own platform/model prompt
 * internally (gateway.service.ts), which nothing on the client sees or sets.
 */
export interface ConversationParams {
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
}

export const DEFAULT_CONVERSATION_PARAMS: ConversationParams = {
  temperature: null,
  topP: null,
  maxTokens: null,
};

/**
 * Phase 4d. The sidebar's row shape — exactly the `columns` subset
 * `GET /api/conversations` selects (apps/web/app/api/conversations/route.ts):
 * `{ id, title, modelId, isPinned, updatedAt, deletedAt }`, minus
 * `deletedAt` (that route already filters soft-deleted rows out of the
 * response, so a row reaching the client never carries it — modeling the
 * field here would just invite a caller to check it and find it always
 * absent). `GET /api/conversations/[id]`'s full row is NOT this type —
 * that one has `messages` attached; ConversationSummary
 * is specifically the list-row view conversation-cache.ts,
 * conversation-grouping.ts, and use-conversations.ts all key off of.
 *
 * `title`/`modelId` are `string | null`, matching the DB columns
 * (`packages/db/src/schema/conversations.ts`: neither has `.notNull()`)
 * — a brand-new conversation has no title until B1's auto-title job (or
 * the user's first rename) runs, and no modelId until the first message
 * picks one.
 *
 * `updatedAt` is a plain ISO string (JSON has no Date type) — same "one
 * conversion point" rule as `ChatMessage.createdAt` above; conversion to
 * a Date only happens at the point of use (conversation-grouping.ts's
 * `groupKeyForDate`).
 */
export interface ConversationSummary {
  id: string;
  title: string | null;
  modelId: string | null;
  isPinned: boolean;
  updatedAt: string;
}
