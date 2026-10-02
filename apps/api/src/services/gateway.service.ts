import { config } from "../config";
import { CREDIT_VALUE_USD, estimateTokenCount } from "@ai-platform/config";
import { deductCreditsAtomic, getBalance } from "./balance.service";
import { TRANSCRIPTION_CATEGORY } from "./transcription.policy";
import { db, messages, conversations, models } from "@ai-platform/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { recordUpstreamCall, recordCreditsSpent, streamingConnectionsActive } from "../metrics";
import { claimUserMessage, chatIdempotencyRedis, type IdempotencyRedis } from "./chat-idempotency.service";
import { buildSystemPrompt, compactHistory } from "./history-compaction.service";
import { reportError } from "../monitoring/error-hook";
import {
  CHAT_ATTACHMENT_ERRORS, CHAT_ATTACHMENT_LIMITS, ChatAttachmentError,
  allocateBudget, buildDocumentBlock, buildUserContent, contentText, documentCharBudget,
  imageTokenEstimate, makeDelimiter,
  type ProviderContent,
} from "./chat-attachments.policy";
import type { ResolveArgs, ResolvedAttachments } from "./chat-attachments.service";
import type { StreamVersion } from "@ai-platform/types";
import { StreamV2Writer } from "./stream-v2";
import { StreamNormalizer, STATUS_AFTER_MS } from "./stream-normalize";
import { BlockRecorder } from "./message-blocks";

/** What is actually sent to the provider: content is a string, or parts when an image is attached (P5.2b). */
type ProviderMessage = { role: string; content: ProviderContent };

/**
 * Cost is computed from the `models` table now, not the static
 * WHOLESALE_COSTS/MODEL_CATALOG map — those only ever covered a fixed
 * hand-picked list and threw on anything synced in from the gateway
 * (e.g. free OpenRouter models added via a New API channel).
 */
/** Shared numeric extraction — `models` numeric columns come back as
 *  strings from the pg driver, so every cost calculation needs this. */
function modelPricing(model: typeof models.$inferSelect) {
  return {
    wholesaleIn:  Number(model.wholesaleCostInputPerM),
    wholesaleOut: Number(model.wholesaleCostOutputPerM),
    markup:       Number(model.markupMultiplier),
  };
}

function calcCreditCost(model: typeof models.$inferSelect, inputTokens: number, outputTokens: number): number {
  const { wholesaleIn, wholesaleOut, markup } = modelPricing(model);

  const inputCost  = (inputTokens  / 1_000_000) * wholesaleIn  * markup;
  const outputCost = (outputTokens / 1_000_000) * wholesaleOut * markup;
  const totalUsd    = inputCost + outputCost;

  // Always round UP (protects margins), minimum 1 micro-credit
  return Math.max(Math.ceil((totalUsd / CREDIT_VALUE_USD) * 1_000_000), 1);
}

/**
 * BUG FIX (balance/no-limit audit): the only pre-flight balance gate used
 * to be `balance.credits <= 0` in index.ts. That blocks a fully-drained
 * account but does nothing for a small *positive* balance that's smaller
 * than what THIS request will actually cost — e.g. 77.15 credits left,
 * request ends up costing 114.16. That request was still let all the way
 * through to the provider (full cost incurred on our side), and the
 * post-stream `deductCreditsAtomic` call correctly refused to take the
 * balance negative — but its result was never checked (see the
 * fire-and-forget call below, previously bare `.catch(console.error)`,
 * which only catches *thrown* errors, never a resolved `{success:false}`).
 * Net effect: balance never moves, nothing ever blocks the next request
 * either, and the same under-priced message can be repeated with no
 * limit — exactly what was reported.
 *
 * Fix: bound the worst-case cost of this specific request to what the
 * user can actually afford, before any provider call happens. We clamp
 * `max_tokens` down to the affordable ceiling rather than hard-rejecting
 * whenever possible, so a low-balance user can still send a short
 * message — this also matches the product's own design (spend is
 * controlled via max output tokens, not a hard per-message price gate).
 *
 * This does not by itself close the narrower race where two concurrent
 * requests from the same user both pass this check before either
 * deduction commits — `deductCreditsAtomic`'s `WHERE credits >= X` still
 * makes that safe (one of the two will fail atomically), but that second
 * request's user-facing content would still have been generated for
 * free. P1.2 closes that: the /chat route wraps streamChat in
 * `withBilledOperationLock` (billing-lock.service.ts), so a user has at
 * most one billed request in flight and this check always sees the balance
 * left by the previous deduction. The atomic WHERE stays as the last line
 * of defence.
 */
async function checkAffordability(
  userId: string,
  model: typeof models.$inferSelect,
  estimatedInputTokens: number,
  requestedMaxTokens: number | undefined
): Promise<
  | { ok: true; maxTokens: number }
  | { ok: false }
> {
  const { wholesaleIn, wholesaleOut, markup } = modelPricing(model);
  const balance = await getBalance(userId);
  const availableUsd = (balance.credits / 1_000_000) * CREDIT_VALUE_USD;
  const inputCostUsd = (estimatedInputTokens / 1_000_000) * wholesaleIn * markup;

  const ceiling = requestedMaxTokens !== undefined
    ? Math.min(requestedMaxTokens, model.maxOutputTokens)
    : model.maxOutputTokens;

  if (balance.credits <= 0 || availableUsd < inputCostUsd) {
    // Can't afford even the input side (or already at/below zero) — no
    // amount of output clamping fixes that.
    return { ok: false };
  }

  if (wholesaleOut <= 0) {
    // Genuinely free output (a deliberately $0-priced model) — nothing to
    // clamp beyond the model/request's own ceiling.
    return { ok: true, maxTokens: ceiling };
  }

  const remainingUsd         = availableUsd - inputCostUsd;
  const affordableOutputTokens = Math.floor(remainingUsd / ((wholesaleOut * markup) / 1_000_000));

  if (affordableOutputTokens <= 0) {
    return { ok: false };
  }

  return { ok: true, maxTokens: Math.min(ceiling, affordableOutputTokens) };
}

/**
 * Some free/low-tier OpenRouter models occasionally return a moderation
 * classifier's own scratch output instead of an actual reply — e.g. a
 * bare "User Safety: safe / Response Safety: safe" stub — typically when
 * the upstream provider's safety pass runs but the underlying completion
 * gets dropped or truncated to nothing. That's a garbage response, not a
 * real answer: a user who reads that back is right to feel cheated if
 * they were also billed for it, so we detect the shape and treat it the
 * same as a $0/no-content response rather than charging normal output
 * tokens for it.
 *
 * Deliberately narrow (only lines matching the "<Label> Safety: safe"
 * pattern) rather than a generic "response looks short/weird" heuristic
 * — we never want to refuse-bill a legitimately short real answer.
 */
const SAFETY_STUB_PATTERN = /^\s*(?:user|response|prompt|input|output)\s*safety\s*:\s*(?:safe|unsafe)\s*$/im;

function isSafetyClassifierStub(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  // Every non-empty line matches the "<Label> Safety: safe/unsafe" shape,
  // and there's at least one such line — i.e. the whole reply IS the
  // stub, not a real answer that happens to mention "safety" somewhere.
  return lines.length > 0 && lines.every((l) => SAFETY_STUB_PATTERN.test(l));
}

const ERROR_MESSAGES: Record<number, string> = {
  429: "تجاوزت حد الطلبات. انتظر لحظة وحاول مجدداً.",
  503: "النموذج غير متاح حالياً. جرّب نموذجاً آخر.",
  400: "طلب غير صالح. حاول تعديل رسالتك.",
  500: "خطأ في الخادم. نحن نعمل على إصلاحه.",
  504: "انتهت مهلة الطلب. حاول مجدداً.",
};

/**
 * Combines any number of AbortSignals into one that aborts as soon as ANY
 * input signal aborts. `AbortSignal.any()` (Node 20.3+) would do this
 * directly, but this repo's engines field / CI runner version isn't
 * confirmed here (unverifiable without running code — see phase summary),
 * so this uses the manual listener form, which works on any Node 18+.
 * Whichever signal fires first "wins" — its `reason` becomes the combined
 * signal's abort reason, which is how the F5 fetch's catch block below
 * tells a real client disconnect apart from the 120s safety timeout.
 */
function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export interface StreamChatOptions {
  userId:         string;
  model:          string;
  messages:       Array<{ role: string; content: string }>;
  conversationId: string;
  reply: {
    raw:    { setHeader: Function; write: Function; end: Function };
    status: (code: number) => { send: (body: unknown) => void };
  };
  /** F3 — optional generation params, forwarded to the gateway as-is
   *  (temperature/top_p) or clamped against the resolved model (max_tokens).
   *  `| undefined` is required (not just `?`) because callers such as
   *  index.ts spread a parsed Zod object through — those fields are typed
   *  `number | undefined`, and with `exactOptionalPropertyTypes: true`
   *  assigning an explicit `undefined` to a bare `foo?: number` property is
   *  a type error (missing vs. present-but-undefined are distinct). */
  temperature?: number | undefined;
  top_p?:       number | undefined;
  max_tokens?:  number | undefined;
  /** F4 — idempotency. See chat-idempotency.service.ts. */
  clientMessageId?: string | undefined;
  regenerate?:      boolean | undefined;
  /** F5 — aborts the upstream fetch when the client disconnects. Combined
   *  with the existing 120s safety timeout below; either firing cancels the
   *  request. Optional so existing callers/tests that don't wire this up
   *  keep working unchanged (falls back to timeout-only behavior). */
  abortSignal?: AbortSignal;
  /** P5.2b — attachments to use in this turn (see chat.schema.ts). Absent = exact old behaviour. */
  attachmentIds?: string[] | undefined;
  /** P6.1 — stream protocol negotiated from the Accept header (index.ts). Absent or "v1" = the plain-text stream, byte-identical to before. */
  streamVersion?: StreamVersion | undefined;
  /** Test seam only — real callers get the DB/storage-backed resolver (loaded lazily). */
  resolveAttachments?: (args: ResolveArgs) => Promise<ResolvedAttachments>;
  /** P1.2 — id generated by the route that holds the billing lock
   *  (billing-lock.service.ts). Optional: falls back to a fresh UUID. */
  requestId?: string | undefined;
  /** Test seam only — real callers get the shared Redis singleton. */
  idempotencyRedis?: IdempotencyRedis;
}

export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const { userId, model: modelId, reply } = opts;

  // Only status="published" AND isAvailable=true is chattable — this is
  // the same gate models.router.ts's `list` uses, so if a model shows up
  // in the picker it will always resolve here too (and vice versa: a
  // pending/disabled/hidden model id can never be used to route a chat
  // request even if someone replays an old request with it).
  const model = await db.query.models.findFirst({
    where: and(eq(models.id, modelId), eq(models.status, "published"), eq(models.isAvailable, true)),
  });
  // P5.3: a speech-to-text model is not a chat model, even if someone sends its id by hand.
  if (!model || (model.categories ?? []).includes(TRANSCRIPTION_CATEGORY)) {
    reply.status(404).send({ error: "MODEL_NOT_FOUND", message: "النموذج غير موجود." });
    return;
  }

  // P5.2b: resolve attachments BEFORE anything is inserted. A rejected request (foreign id, not
  // ready, image on a non-vision model ...) must not leave a saved user message behind, and the
  // error must be explicit: a file is never silently dropped.
  let resolvedAttachments: ResolvedAttachments | null = null;
  if (opts.attachmentIds && opts.attachmentIds.length > 0) {
    try {
      const resolve = opts.resolveAttachments ?? (await import("./chat-attachments.service")).resolveChatAttachments;
      resolvedAttachments = await resolve({
        userId,
        conversationId: opts.conversationId,
        ids:            opts.attachmentIds,
        model:          { supportsVision: model.supportsVision, categories: model.categories },
      });
    } catch (err) {
      if (err instanceof ChatAttachmentError) {
        const e = CHAT_ATTACHMENT_ERRORS[err.code];
        reply.status(e.status).send({ error: err.code, message: e.message });
        return;
      }
      throw err; // unexpected (DB down ...): Fastify's error hook reports it
    }
  }

  // Make sure the conversation row exists before anything gets inserted
  // against it. The web app is expected to create this via POST
  // /api/conversations before it ever calls /chat, but we don't want a
  // stale/forged/missing conversationId to blow up message inserts with
  // a foreign-key violation (see: every "hi" from a fresh chat used to
  // fail here because no row existed for the id it generated).
  await db.insert(conversations)
    .values({
      id:      opts.conversationId,
      userId,
      title:   opts.messages.at(-1)?.content?.slice(0, 80) ?? null,
      modelId,
    })
    .onConflictDoNothing();

  // Load whatever rolling-summary state this conversation already has
  // (both columns default to null/0 for a brand-new row just inserted
  // above, or for any conversation created before this migration ran).
  const conversationRow = await db.query.conversations.findFirst({
    where: eq(conversations.id, opts.conversationId),
    columns: { summary: true, summarizedMessageCount: true, title: true, modelId: true },
  });

  // P6.3c: a conversation created BEFORE its first message (POST /api/conversations, used so a file can
  // be attached in a brand-new chat) is a row with no title and no model; the insert above did nothing
  // because the row exists. Fill them in now, for the owner's row only. Fire-and-forget like the
  // summary update below: a failure leaves an untitled chat, never a failed request.
  if (conversationRow && (conversationRow.title === null || conversationRow.modelId === null)) {
    const firstTitle = opts.messages.at(-1)?.content?.slice(0, 80) ?? null;
    const patch: { title?: string; modelId?: string } = {
      ...(conversationRow.title === null && firstTitle ? { title: firstTitle } : {}),
      ...(conversationRow.modelId === null ? { modelId } : {}),
    };
    if (Object.keys(patch).length > 0) {
      db.update(conversations)
        .set(patch)
        .where(and(eq(conversations.id, opts.conversationId), eq(conversations.userId, userId)))
        .catch((err) => console.error("[conversation] failed to fill title/model:", err));
    }
  }

  // Persist the user's turn. Only the assistant reply was ever saved
  // before (fire-and-forget, after the stream), so conversation history
  // was silently empty on reload even when the FK error didn't fire.
  //
  // F4 (idempotency): a `regenerate` call means the user's turn was already
  // persisted by the original request — never insert a second copy. A
  // `clientMessageId` claims the (conversationId, clientMessageId) pair via
  // Redis SET NX; the insert only runs the first time that pair is seen, so
  // a client retry (network blip, double-submit) can't create a duplicate
  // row. No clientMessageId at all preserves the exact pre-B1 behavior
  // (always insert) — that's the only path a raw API-key caller (F17) is on
  // until it starts sending the new field.
  const lastUserMessage = opts.messages.at(-1);
  if (lastUserMessage?.role === "user" && !opts.regenerate) {
    const shouldInsert = opts.clientMessageId
      ? await claimUserMessage(opts.idempotencyRedis ?? chatIdempotencyRedis, opts.conversationId, opts.clientMessageId)
      : true;
    if (shouldInsert) {
      db.insert(messages).values({
        conversationId: opts.conversationId,
        role:           "user",
        content:        lastUserMessage.content,
        modelId,
      }).catch(console.error);
    }
  }

  // Server-owned system prompt: platform base rules + this model's own
  // additions, both admin-authored — see history-compaction.service.ts.
  // Never derived from the request body anymore; chat.schema.ts has no
  // client-settable systemPrompt field at all.
  const systemPrompt = await buildSystemPrompt(model);

  // Bound how much of the conversation actually gets resent to the
  // provider — a rolling summary replaces older turns once the
  // conversation crosses ~50% of the model's context window, so cost and
  // latency stay flat as a conversation grows instead of scaling with its
  // full length every single turn. See history-compaction.service.ts for
  // the threshold/degrade behavior.
  const compacted = await compactHistory({
    fullHistory:            opts.messages,
    existingSummary:        conversationRow?.summary ?? null,
    summarizedMessageCount: conversationRow?.summarizedMessageCount ?? 0,
    model,
  });

  if (compacted.updatedSummary) {
    db.update(conversations)
      .set({
        summary:                compacted.updatedSummary.summary,
        summarizedMessageCount: compacted.updatedSummary.summarizedMessageCount,
      })
      .where(eq(conversations.id, opts.conversationId))
      .catch((err) => console.error("[history-compaction] failed to persist updated summary:", err));
  }

  // P5.2b: document text and images go ONLY into what is sent to the provider, here, after
  // compaction (compaction and the saved user row both work on the text as the client sent it,
  // so a whole document never lands in chat history or in a rolling summary).
  const history: ProviderMessage[] = [...compacted.gatewayMessages];
  let imageCount = 0;
  if (resolvedAttachments) {
    const { documents, images } = resolvedAttachments;
    imageCount = images.length;

    let block: string | null = null;
    if (documents.length > 0) {
      const baseTokens = estimateTokenCount(
        [systemPrompt, ...history.map((m) => contentText(m.content))].filter((t): t is string => Boolean(t)).join(" ")
      ) + images.length * CHAT_ATTACHMENT_LIMITS.imageTokenAllowance;
      const budget  = documentCharBudget({
        contextWindow: model.contextWindow, maxOutputTokens: model.maxOutputTokens,
        usedTokens: baseTokens, documentCount: documents.length,
      });
      const budgets = allocateBudget(documents.map((d) => d.text.length), budget);
      // No room for a meaningful part of a document: refuse instead of sending a stub.
      if (documents.some((d, i) => budgets[i]! < Math.min(CHAT_ATTACHMENT_LIMITS.minDocumentChars, d.text.length))) {
        reply.status(400).send({
          error:   "CONTEXT_TOO_LONG",
          message: "رسالتك أطول من الحد المسموح. قلّل الرسالة أو اختر نموذجاً بسياق أوسع.",
        });
        return;
      }
      const delimiter = makeDelimiter([...documents.map((d) => d.text), ...documents.map((d) => d.fileName)]);
      block = buildDocumentBlock(documents, budgets, delimiter);
    }

    const last = history[history.length - 1];
    if (last && last.role === "user" && typeof last.content === "string") {
      history[history.length - 1] = { role: "user", content: buildUserContent(last.content, block, images) };
    } else {
      // Not reachable through /chat (the schema requires a last user turn); kept safe anyway.
      history.push({ role: "user", content: buildUserContent("", block, images) });
    }
  }

  // Estimate token count to pre-validate. Uses what's ACTUALLY going to be
  // sent (system prompt + compacted history + attachment text), not the full raw history —
  // that's the whole point of compaction. Images add a fixed allowance each (estimate only:
  // the real bill uses the provider's reported prompt_tokens). The hard context-window gate
  // below is still a real safety net even after compaction: a single
  // still-too-large recent message, or a summarization call that failed
  // and fell back to raw history, can still legitimately be too long.
  const allText     = [systemPrompt, ...history.map((m) => contentText(m.content))]
    .filter((t): t is string => Boolean(t))
    .join(" ");
  const estTokens   = estimateTokenCount(allText) + imageCount * CHAT_ATTACHMENT_LIMITS.imageTokenAllowance;
  const maxContext  = model.contextWindow * 0.95;

  if (estTokens > maxContext) {
    reply.status(400).send({
      error:   "CONTEXT_TOO_LONG",
      message: "رسالتك أطول من الحد المسموح. قلّل الرسالة أو اختر نموذجاً بسياق أوسع.",
    });
    return;
  }

  // Affordability pre-check — see checkAffordability's doc comment above
  // for the bug this closes. Runs after the context-length check (cheap,
  // no DB hit) and before we touch the provider (one balance read).
  const affordability = await checkAffordability(userId, model, estTokens, opts.max_tokens);
  if (!affordability.ok) {
    reply.status(402).send({
      error:      "INSUFFICIENT_BALANCE",
      message:    "رصيدك لا يكفي لهذه الرسالة. يرجى شحن حسابك.",
      redirectTo: "/billing",
    });
    return;
  }

  // P1.2: the /chat route owns the per-user billing lock and passes its
  // requestId down, so the lock value, the gateway X-Request-ID and the
  // billing ledger row all carry the same id. Callers that don't hold a lock
  // (tests, future internal callers) keep the old behaviour.
  const requestId = opts.requestId ?? crypto.randomUUID();
  let upstream: Response;
  const upstreamStartedAt = Date.now();

  // System prompt is sent as a leading system message, ahead of whatever
  // compaction produced (summary-as-context, if any, then recent raw
  // messages). Never merged into/mutating opts.messages — that's the full
  // client-sent history, which is also what got persisted above and is
  // untouched by compaction (only what's forwarded upstream is bounded).
  const gatewayMessages: ProviderMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...history]
    : history;

  // Always bounded now (previously `undefined` — i.e. no cap sent to the
  // gateway at all — whenever the caller didn't pass max_tokens). Sending
  // `undefined` let a request run all the way to the model's own ceiling
  // regardless of what the user could actually pay for; `affordability`
  // above already folds in the request's own max_tokens *and* the model's
  // maxOutputTokens, so this is always the tightest of the three.
  const maxTokens = affordability.maxTokens;

  // F5: the client-disconnect signal (bound to `reply.raw`'s "close" event
  // by index.ts) and the 2-minute safety timeout both cancel this fetch —
  // whichever fires first. Previously ONLY the timeout could cancel it, so
  // hitting Stop / closing the tab left the upstream provider generating
  // (and us paying for) the full response for up to 2 more minutes.
  const timeoutSignal = AbortSignal.timeout(120_000);
  const combinedSignal = opts.abortSignal
    ? combineAbortSignals([timeoutSignal, opts.abortSignal])
    : timeoutSignal;

  try {
    upstream = await fetch(`${config.GATEWAY_URL}/v1/chat/completions`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${config.GATEWAY_MASTER_KEY}`,
        "X-User-ID":     userId,
        "X-Request-ID":  requestId,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:          modelId,
        messages:       gatewayMessages,
        stream:         true,
        stream_options: { include_usage: true },
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.top_p       !== undefined ? { top_p: opts.top_p }             : {}),
        ...(maxTokens        !== undefined ? { max_tokens: maxTokens }         : {}),
      }),
      signal: combinedSignal,
    });
  } catch (err: unknown) {
    recordUpstreamCall(model.provider, modelId, (Date.now() - upstreamStartedAt) / 1000, false);
    // A client-disconnect abort is neither a timeout nor a gateway error —
    // there's no reply to send (the connection is already gone), so just
    // stop here without writing to `reply`. `err.name === "AbortError"` is
    // what a DOMException-shaped abort reports; `TimeoutError` is what
    // AbortSignal.timeout()'s own reason reports specifically.
    const isClientDisconnect = opts.abortSignal?.aborted && !timeoutSignal.aborted;
    if (isClientDisconnect) return;
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    reply.status(isTimeout ? 504 : 502).send({
      error:   isTimeout ? "TIMEOUT" : "GATEWAY_ERROR",
      message: isTimeout ? "انتهت مهلة الطلب. حاول مجدداً." : "خطأ في الاتصال بالخادم.",
    });
    return;
  }

  if (!upstream.ok) {
    recordUpstreamCall(model.provider, modelId, (Date.now() - upstreamStartedAt) / 1000, false, upstream.status);
    const errBody   = await upstream.json().catch(() => ({}));
    // 503 from the gateway means the specific model is down — surface it
    // as MODEL_UNAVAILABLE so the frontend's existing check (which never
    // actually matched anything before) has something real to catch.
    const errorCode = upstream.status === 503
      ? "MODEL_UNAVAILABLE"
      : ((errBody as Record<string, unknown>)?.error ?? "UPSTREAM_ERROR");
    reply.status(upstream.status).send({
      error:   errorCode,
      message: ERROR_MESSAGES[upstream.status] ?? "حدث خطأ غير متوقع.",
      status:  upstream.status,
    });
    return;
  }

  // Headers arrived and status is OK — record success now. The rest of the
  // stream (Step below) can still fail/interrupt, but that's a delivery
  // problem, not an upstream-provider problem, so it isn't counted here.
  recordUpstreamCall(model.provider, modelId, (Date.now() - upstreamStartedAt) / 1000, true);

  // Only now do we know we're actually about to stream real content, so
  // only now do we commit to raw/streaming mode. `useChat` is configured
  // with `streamProtocol: "text"` on the client, which just appends
  // whatever bytes arrive as message content — no SSE framing, no JSON
  // envelope. Forwarding the upstream's raw OpenAI-format SSE chunks (as
  // this used to do) doesn't match ANY protocol `useChat` understands by
  // default, so the client-side parser threw on every single response —
  // including fully successful ones — which is what was showing up as
  // "Connection interrupted" regardless of what the server logs said.
  const isV2 = opts.streamVersion === "v2";
  reply.raw.setHeader("Content-Type",      isV2 ? "text/event-stream; charset=utf-8" : "text/plain; charset=utf-8");
  reply.raw.setHeader("Cache-Control",     "no-cache");
  reply.raw.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  // Stream response back
  //
  // IMPORTANT: this used to regex-match against each raw network chunk
  // independently (`chunk.match(...)`). That silently broke billing
  // whenever a chunk boundary landed inside the JSON — most commonly the
  // final `usage` object, which regularly arrives split across two
  // `reader.read()` calls. When "prompt_tokens" and "completion_tokens"
  // ended up in different chunks, NEITHER regex matched, both stayed 0,
  // and the billing gate below (`outputTokens > 0`) skipped billing AND
  // message-saving entirely — a fully-answered chat that cost the user
  // nothing and never appeared in logs/dashboard. The same per-chunk
  // regex could also drop/corrupt streamed content if a chunk split
  // landed inside a "content" string's escape sequence.
  //
  // Fix: buffer bytes until we have a *complete* line, then JSON.parse
  // it like any other SSE consumer would. This makes chunk boundaries
  // irrelevant — a line is only ever processed once it's whole.
  const reader          = upstream.body!.getReader();
  const decoder         = new TextDecoder();
  let sseBuffer         = "";
  let inputTokens       = 0;
  let outputTokens      = 0;
  let streamedContent   = "";
  let isPartial         = true;

  // P6.1: v2 wraps the same content deltas in structured events; v1 writes them raw, as always.
  const v2 = isV2
    ? new StreamV2Writer((frame) => { reply.raw.write(frame); }, { id: requestId, model: modelId })
    : null;
  v2?.start();
  // P6.2: v2 maps reasoning and tool-call chunks too; v1 never does, so its path below is untouched.
  // P6.4: the recorder sits between the normalizer and the writer: it forwards every call to the
  // writer unchanged (the wire stream is the same with or without it) and keeps the ordered blocks
  // that are saved with the message. v1 has no blocks, so it records nothing.
  const recorder = v2 ? new BlockRecorder(v2) : null;
  const normalizer = recorder ? new StreamNormalizer(recorder, requestId) : null;
  // P6.2: if the upstream stays silent, say so once (status "waiting"). Cleared on the first output and
  // in the finally below, so it can never fire after content or after the stream ended.
  let statusTimer: ReturnType<typeof setTimeout> | null = v2
    ? setTimeout(() => { statusTimer = null; v2.status("waiting"); }, STATUS_AFTER_MS)
    : null;
  const cancelStatus = () => { if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; } };

  streamingConnectionsActive.inc();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { isPartial = false; break; }

      sseBuffer += decoder.decode(value, { stream: true });

      const lines = sseBuffer.split("\n");
      // The last element may be a partial line cut mid-chunk — hold it
      // back and prepend it to the next read instead of parsing it now.
      sseBuffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (payload === "[DONE]" || payload === "") continue;

        let parsed: any;
        try {
          parsed = JSON.parse(payload);
        } catch {
          // Genuinely malformed line (not just a boundary split, since we
          // only parse complete lines here) — skip it, don't crash the stream.
          continue;
        }

        if (normalizer) {
          if (normalizer.push(parsed)) cancelStatus();
          streamedContent = normalizer.text;
        } else {
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            streamedContent += delta;
            reply.raw.write(delta);
          }
        }

        if (parsed?.usage) {
          if (typeof parsed.usage.prompt_tokens === "number")     inputTokens  = parsed.usage.prompt_tokens;
          if (typeof parsed.usage.completion_tokens === "number") outputTokens = parsed.usage.completion_tokens;
        }
      }
    }
  } catch (err: unknown) {
    // Stream interrupted — isPartial stays true.
    // P6.4 (diagnostic only, no behaviour change): record WHY, so the next "Response interrupted"
    // can be explained from the logs instead of guessed. No message content, no user data.
    const cause = timeoutSignal.aborted ? "timeout_120s"
      : opts.abortSignal?.aborted ? "client_disconnect_or_shutdown"
      : "upstream_error";
    // A number only: the log scanner (security/log-hygiene.test.ts) forbids naming the text itself.
    const receivedChars = streamedContent.length;
    console.warn("[chat] stream interrupted", {
      requestId, modelId, cause,
      elapsedMs: Date.now() - upstreamStartedAt,
      receivedChars,
      errorName:     err instanceof Error ? err.name : typeof err,
      errorMessage:  err instanceof Error ? err.message.slice(0, 200) : undefined,
    });
  } finally {
    cancelStatus();
    streamingConnectionsActive.dec();
  }

  // P6.1: the response is ended only after the (pure) token fallback and cost math, so the v2
  // tail can report usage. For v1 nothing is written here, so its bytes are unchanged.
  let shouldBill = false;
  let cost       = 0;
  // P6.4: closed right after the read loop (not after billing), so a thinking block's duration is
  // the time the model spent reasoning, not that plus the database round trip.
  const contentBlocks = recorder?.result() ?? null;
  try {
    // Some gateway/provider combinations omit `usage` entirely even on a
    // clean finish (stream_options.include_usage isn't universally honored
    // downstream). Never let a missing usage object mean "bill nothing" —
    // fall back to the same char/4 estimate used for the pre-send estimate
    // shown in the UI. This is the last line of defense against a $0 chat.
    // P6.2: in v2, reasoning and tool-call arguments are output the model produced and the user pays for
    // (v1 never has any, so `extraOutput` is "" there and nothing changes). The saved message stays text only.
    const extraOutput = normalizer?.extraOutput ?? "";
    if ((streamedContent.length > 0 || extraOutput.length > 0) && outputTokens === 0) {
      outputTokens = estimateTokenCount(streamedContent + extraOutput);
    }
    if (inputTokens === 0) {
      // Billing must reflect what was actually SENT to the provider
      // (gatewayMessages: system prompt + compacted history), not the full
      // client-side history — those diverge once compaction has kicked in,
      // and billing the uncompacted length would overcharge the user for
      // tokens the provider never saw.
      // P5.2b: content can be parts now; count the text and add the image allowance.
      inputTokens = estimateTokenCount(gatewayMessages.map((m) => contentText(m.content)).join(" "))
        + imageTokenEstimate(gatewayMessages);
    }

    // A garbage moderation-stub reply (see isSafetyClassifierStub above)
    // never gets billed, no matter what token counts the upstream reported
    // — the user got nothing usable back, so charging them for it is a
    // bug, not a billing edge case. `cost` stays 0 for this branch and the
    // saved message's `creditCost` reflects that honestly.
    const isGarbageReply = isSafetyClassifierStub(streamedContent);

    // Bill exactly once, and only for output the user actually received (or a partial that streamed).
    shouldBill = outputTokens > 0 || (isPartial && (streamedContent.length > 0 || extraOutput.length > 0));
    cost       = shouldBill && !isGarbageReply ? calcCreditCost(model, inputTokens, outputTokens) : 0;

    // P6.1: the v2 tail carries the usage, so it is written here, after the pure cost math and
    // before the response ends. Billing/saving below is unchanged and still runs after end().
    if (v2) {
      if (isPartial) v2.error("STREAM_INTERRUPTED", "انقطع الاتصال أثناء الاستجابة. يمكنك إعادة المحاولة.");
      const stopReason = isPartial ? "interrupted" : normalizer?.finishReason === "tool_calls" ? "tool_use" : "end_turn";
      v2.finish(stopReason, { inputTokens, outputTokens, creditCost: cost });
    }
  } finally {
    // Always end the response, even if the bookkeeping above threw.
    reply.raw.end();
  }

  // Post-stream: deduct credits and save message.
  //
  // BUG FIX: this used to be `deductCreditsAtomic(...).catch(console.error)`
  // — fire-and-forget. `.catch` only fires on a *thrown* error; a normal,
  // successfully-resolved `{ success: false, reason: "INSUFFICIENT_BALANCE" }`
  // (the atomic `WHERE credits >= X` correctly refusing to go negative) was
  // never inspected, so a failed deduction was silently indistinguishable
  // from a successful one — and `recordCreditsSpent` was called
  // unconditionally, so the Grafana "revenue" metric counted credits that
  // were never actually collected. The response has already been fully
  // streamed to the client by this point either way, so `await`ing here
  // costs a few ms of server-side bookkeeping, not user-facing latency.
  if (shouldBill) {
    if (cost > 0) {
      const deductResult = await deductCreditsAtomic(userId, cost, "Chat usage", {
        modelId, inputTokens, outputTokens, requestId,
      }).catch((err) => {
        console.error("[billing] deductCreditsAtomic threw:", err);
        // P2.1: a THROWN deduction (DB down mid-billing) is a money fault. No-op
        // unless index.ts registered the Sentry sink; never throws.
        reportError(err, { tags: { source: "billing", stage: "post-stream-deduct" } });
        return { success: false as const, newBalance: 0 };
      });

      if (deductResult.success) {
        recordCreditsSpent(modelId, cost);
      } else {
        // The affordability pre-check should make this unreachable except
        // for a genuine concurrent-request race (see checkAffordability's
        // doc comment) — surface it loudly since it means this user got a
        // full response for free. balanceDeductionFailuresTotal (inside
        // deductCreditsAtomic) already counts it for alerting.
        console.error(
          `[billing] deduction failed after a completed stream — user ${userId} ` +
          `got ${outputTokens} output tokens free (wanted ${cost} micro-credits, ` +
          `request ${requestId}, model ${modelId})`
        );
      }
    }

    // Save assistant message
    db.insert(messages).values({
      conversationId:   opts.conversationId,
      role:             "assistant",
      content:          streamedContent,
      // P6.4: null for v1 and for rows with nothing structured; readers treat null as one text block.
      contentBlocks,
      inputTokens,
      outputTokens,
      creditCost:       cost,
      modelId,
      gatewayRequestId: requestId,
      isPartial,
    }).catch(console.error);

    // Update conversation timestamp
    db.update(conversations)
      .set({ updatedAt: new Date(), modelId })
      .where(eq(conversations.id, opts.conversationId))
      .catch(console.error);
  }
}
