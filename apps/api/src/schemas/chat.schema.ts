import { z } from "zod";

/**
 * Validates the body of `POST /chat`.
 *
 * Kept as a standalone module (not inlined in index.ts) because index.ts
 * calls `app.listen()` at module scope with no `app.inject()` test harness —
 * a schema embedded there is unreachable by unit tests without a bigger
 * refactor that's out of scope for this PR. See chat.schema.test.ts.
 *
 * Every field beyond the original `{ model, messages, conversationId }`
 * trio is OPTIONAL. This is load-bearing: `apps/web/app/api/chat/route.ts`
 * (frozen zone) forwards whatever JSON body it received untouched, and the
 * only other caller is a raw user API key hitting `/chat` directly (F17).
 * Making anything new required would 400 every existing caller.
 */

// Deliberately only "user" | "assistant" — NOT the full messageRoleEnum
// (which also has "system" for what's stored in the `messages` table).
// The system layer is assembled entirely server-side now (platform base
// prompt + per-model prompt, see gateway.service.ts) from trusted DB rows,
// never from the client. Accepting a client-supplied `role: "system"` here
// used to let it plant a fake system message anywhere in the array — the
// gateway only ever prepended the *trusted* systemPrompt, it never
// stripped stray system-role entries already inside `messages`, so that
// was a real prompt-injection hole. Rejecting the role at the schema level
// closes it outright rather than trying to filter it out downstream.
const chatMessageRoleSchema = z.enum(["user", "assistant"]);

const chatMessageSchema = z.object({
  role:    chatMessageRoleSchema,
  // An empty string is a legitimate "just whitespace got trimmed away"
  // client bug we still want the Arabic error path to catch below the
  // gateway (context-length / model-not-found), not reject it here with a
  // generic Zod message the frontend can't localize as nicely.
  content: z.string().max(200_000, "الرسالة طويلة جداً."),
});

export const chatRequestSchema = z.object({
  // P3.5: models.id is varchar(150); anything longer cannot be a real model.
  model: z.string().min(1, "الرجاء اختيار نموذج.").max(150, "اسم النموذج غير صالح."),

  messages: z
    .array(chatMessageSchema)
    .min(1, "الرسالة فارغة.")
    // Generous ceiling — real context-window enforcement happens in
    // gateway.service.ts against the model's own contextWindow (token-based,
    // not message-count-based). This just stops a pathological 50k-message
    // array from reaching that far.
    .max(500, "عدد الرسائل في هذه المحادثة أكبر من الحد المسموح."),

  conversationId: z.string().uuid().optional(),

  // ── New, all-optional (F3 / B1) ────────────────────────────────────
  /** Forwarded to the gateway as-is; provider-side default applies if omitted. */
  temperature: z.number().min(0).max(2).optional(),
  /** Forwarded to the gateway as `top_p`. */
  top_p: z.number().min(0).max(1).optional(),
  /**
   * Requested output cap. Clamped against the resolved model's own
   * `maxOutputTokens` in gateway.service.ts (the model isn't known until
   * after the DB lookup there, so this schema only bounds it to a sane
   * absolute ceiling — the real, model-specific clamp happens downstream).
   */
  max_tokens: z.number().int().positive().max(1_000_000).optional(),

  // ── Idempotency (F4) ────────────────────────────────────────────────
  /**
   * Client-generated UUID for this turn. When present, the user-row insert
   * in gateway.service.ts is claimed once via Redis SET NX — a retried
   * request with the same id is a no-op on the insert, not a duplicate row.
   */
  clientMessageId: z.string().uuid().optional(),
  /**
   * True when this call is a "regenerate" of an existing assistant reply —
   * i.e. the user's turn was already persisted by the original call. The
   * user-row insert is unconditionally skipped in this case, independent of
   * clientMessageId/idempotency-claim state.
   */
  regenerate: z.boolean().optional(),
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;

/**
 * Formats a ZodError into the same `{ error, message, details }` shape the
 * rest of this endpoint's error responses use: `message` is the Arabic
 * string shown to the user, `details` is the raw Zod issue list for
 * developers/logs (never shown in the UI).
 */
export function formatChatValidationError(error: z.ZodError) {
  const firstArabicMessage = error.issues[0]?.message ?? "طلب غير صالح.";
  return {
    error:   "VALIDATION_ERROR" as const,
    message: firstArabicMessage,
    details: error.issues.map((issue) => ({
      path:    issue.path.join("."),
      message: issue.message,
    })),
  };
}
