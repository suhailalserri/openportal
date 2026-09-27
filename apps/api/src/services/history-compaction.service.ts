import { config } from "../config";
import { estimateTokenCount } from "@ai-platform/config";
import { db, conversations, platformConfig, PLATFORM_CONFIG_ID, models } from "@ai-platform/db";
import { eq } from "drizzle-orm";

export interface ChatMessage {
  role:    string;
  content: string;
}

/**
 * How much of the model's context window the (summary + un-summarized
 * recent messages) block is allowed to reach before we fold more of the
 * history into the summary. Deliberately well under 1.0 — this budget is
 * shared with the platform/model system prompt (assembled separately,
 * usually small) and the room the model needs for its own reply
 * (maxOutputTokens), both of which are checked again downstream in
 * gateway.service.ts's existing hard context-length gate. This threshold
 * is what keeps summarization rare (most conversations never cross it) and
 * cheap when it does fire, not the last line of defense.
 */
const SUMMARY_TRIGGER_RATIO = 0.5;

/**
 * Always sent raw, never folded into the summary, regardless of how far
 * over the threshold the conversation is — keeps the model's immediate
 * sense of "what did we just say" sharp. Must be >= 1 so the current
 * user turn is always included raw.
 */
const KEEP_RECENT_MESSAGES = 8;

/** Hard ceiling on the summary call's own output — this is a compression
 *  pass, not a chat reply; runaway output here would defeat the point. */
const SUMMARY_MAX_OUTPUT_TOKENS = 600;

/**
 * Assembles the server-owned system prompt: the platform-wide base rules
 * (one singleton row, applies to every model) followed by this specific
 * model's own additions, if any. Both are admin-authored (admin.router.ts)
 * and never accepted from the client — see chat.schema.ts, which no longer
 * has a `systemPrompt` field at all. Returns undefined only when NEITHER
 * layer has anything set, so gateway.service.ts can skip sending a system
 * message entirely rather than sending an empty one.
 */
export async function buildSystemPrompt(model: typeof models.$inferSelect): Promise<string | undefined> {
  const platformRow = await db.query.platformConfig.findFirst({
    where: eq(platformConfig.id, PLATFORM_CONFIG_ID),
  });

  const parts = [platformRow?.basePrompt?.trim(), model.systemPrompt?.trim()]
    .filter((p): p is string => Boolean(p));

  if (parts.length === 0) return undefined;

  // Two clearly separated blocks rather than a silent concatenation, so a
  // per-model addition never reads as if it silently rewrote the base
  // rules — and so it's obvious in logs/debugging which layer said what.
  return parts.join("\n\n---\n\n");
}

export interface CompactedHistory {
  /** Messages to actually send to the provider, in order: an optional
   *  synthetic system message carrying the rolling summary (if one
   *  exists), followed by the still-raw recent messages. */
  gatewayMessages: ChatMessage[];
  /** Only set when this call produced a NEW/updated summary that should
   *  be persisted (see gateway.service.ts) — undefined means "nothing to
   *  write, either no compaction was needed or it was skipped/failed". */
  updatedSummary?: { summary: string; summarizedMessageCount: number };
}

/**
 * Bounds how much of a conversation gets resent to the provider on every
 * turn. `fullHistory` is the complete client-sent array (oldest → newest,
 * last element is the current user turn) — the client still keeps and
 * sends its own full copy for local rendering/editing; this only changes
 * what WE forward upstream, which is what's actually billed and what
 * counts against the model's context window.
 *
 * `summarizedMessageCount` is a position cursor into `fullHistory`, not a
 * message id — the client payload has no ids attached (see
 * chat.schema.ts), so a count is the only thing that can be matched
 * against it directly. If the client's array is ever SHORTER than the
 * stored cursor (edited/deleted earlier turns, a branched regenerate, a
 * desynced local cache) the cursor is stale by construction — reset to 0
 * and fall back to full raw history for this turn rather than trusting an
 * out-of-range slice. That's a known, acceptable degrade: worst case is
 * one turn resends more than strictly necessary, never wrong/missing
 * content.
 */
export async function compactHistory(opts: {
  fullHistory:             ChatMessage[];
  existingSummary:         string | null;
  summarizedMessageCount:  number;
  model:                   typeof models.$inferSelect;
}): Promise<CompactedHistory> {
  const { fullHistory, model } = opts;

  const cursorValid = opts.summarizedMessageCount > 0
    && opts.summarizedMessageCount < fullHistory.length;
  const cursor          = cursorValid ? opts.summarizedMessageCount : 0;
  const existingSummary = cursorValid ? (opts.existingSummary ?? "") : "";

  const sinceSummary = fullHistory.slice(cursor);

  const estimatedTokens = estimateTokenCount(
    existingSummary + " " + sinceSummary.map((m) => m.content).join(" "),
  );
  const triggerCeiling = model.contextWindow * SUMMARY_TRIGGER_RATIO;

  const summaryMessage: ChatMessage | null = existingSummary
    ? { role: "system", content: `Summary of earlier conversation:\n${existingSummary}` }
    : null;

  if (estimatedTokens <= triggerCeiling || sinceSummary.length <= KEEP_RECENT_MESSAGES) {
    // Under budget, or nothing old enough left to fold in — send as-is.
    return {
      gatewayMessages: summaryMessage ? [summaryMessage, ...sinceSummary] : sinceSummary,
    };
  }

  const toFold = sinceSummary.slice(0, sinceSummary.length - KEEP_RECENT_MESSAGES);
  const recent = sinceSummary.slice(-KEEP_RECENT_MESSAGES);

  const newSummary = await summarizeBatch(existingSummary, toFold, model.id);

  if (!newSummary) {
    // Summarization call failed — degrade to "send everything since the
    // last good cursor raw" rather than losing context or throwing the
    // user's turn away. Costs more tokens this one turn; still correct.
    return {
      gatewayMessages: summaryMessage ? [summaryMessage, ...sinceSummary] : sinceSummary,
    };
  }

  const newCursor = cursor + toFold.length;
  return {
    gatewayMessages: [{ role: "system", content: `Summary of earlier conversation:\n${newSummary}` }, ...recent],
    updatedSummary:  { summary: newSummary, summarizedMessageCount: newCursor },
  };
}

/**
 * One internal, non-streaming call to a cheap/fast model that folds
 * `toFold` into `existingSummary`. This is platform overhead — never
 * billed to the user, never counted against their balance — so it always
 * uses `config.SUMMARIZATION_MODEL`, independent of whatever model the
 * user is chatting with. Returns null on any failure so the caller can
 * degrade gracefully instead of breaking the user's actual turn over a
 * background compaction step.
 */
async function summarizeBatch(
  existingSummary: string,
  toFold: ChatMessage[],
  originatingModelId: string,
): Promise<string | null> {
  const transcript = toFold.map((m) => `${m.role}: ${m.content}`).join("\n");
  const prompt = existingSummary
    ? `Existing summary of an earlier part of this conversation:\n${existingSummary}\n\n` +
      `New messages to fold in:\n${transcript}\n\n` +
      `Write one updated summary covering both, in plain prose. Preserve concrete facts, ` +
      `decisions, names, numbers and any open questions. Do not add commentary or headers.`
    : `Summarize the following conversation so far in plain prose, preserving concrete facts, ` +
      `decisions, names, numbers and any open questions. Do not add commentary or headers.\n\n${transcript}`;

  try {
    const res = await fetch(`${config.GATEWAY_URL}/v1/chat/completions`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${config.GATEWAY_MASTER_KEY}`,
        "Content-Type":  "application/json",
        "X-Internal-Purpose": "history-summarization",
      },
      body: JSON.stringify({
        model:       config.SUMMARIZATION_MODEL,
        messages:    [{ role: "user", content: prompt }],
        stream:      false,
        max_tokens:  SUMMARY_MAX_OUTPUT_TOKENS,
        temperature: 0.2,
      }),
      // Summarization is a background-ish step riding along a live user
      // request — bounded well under the main 120s upstream timeout so a
      // slow summarizer never becomes why the user's own reply stalls.
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.error(`[history-compaction] summarization call failed: ${res.status} (model ${originatingModelId})`);
      return null;
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.error("[history-compaction] summarization call threw:", err);
    return null;
  }
}
