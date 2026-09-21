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
}
