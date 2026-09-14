import { config } from "../config";
import { CREDIT_VALUE_USD, estimateTokenCount } from "@ai-platform/config";
import { deductCreditsAtomic } from "./balance.service";
import { db, messages, conversations, models } from "@ai-platform/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { recordUpstreamCall, recordCreditsSpent, streamingConnectionsActive } from "../metrics";

/**
 * Cost is computed from the `models` table now, not the static
 * WHOLESALE_COSTS/MODEL_CATALOG map — those only ever covered a fixed
 * hand-picked list and threw on anything synced in from the gateway
 * (e.g. free OpenRouter models added via a New API channel).
 */
function calcCreditCost(model: typeof models.$inferSelect, inputTokens: number, outputTokens: number): number {
  const wholesaleIn  = Number(model.wholesaleCostInputPerM);
  const wholesaleOut = Number(model.wholesaleCostOutputPerM);
  const markup       = Number(model.markupMultiplier);

  const inputCost  = (inputTokens  / 1_000_000) * wholesaleIn  * markup;
  const outputCost = (outputTokens / 1_000_000) * wholesaleOut * markup;
  const totalUsd    = inputCost + outputCost;

  // Always round UP (protects margins), minimum 1 micro-credit
  return Math.max(Math.ceil((totalUsd / CREDIT_VALUE_USD) * 1_000_000), 1);
}

const ERROR_MESSAGES: Record<number, string> = {
  429: "تجاوزت حد الطلبات. انتظر لحظة وحاول مجدداً.",
  503: "النموذج غير متاح حالياً. جرّب نموذجاً آخر.",
  400: "طلب غير صالح. حاول تعديل رسالتك.",
  500: "خطأ في الخادم. نحن نعمل على إصلاحه.",
  504: "انتهت مهلة الطلب. حاول مجدداً.",
};

export interface StreamChatOptions {
  userId:         string;
  model:          string;
  messages:       Array<{ role: string; content: string }>;
  conversationId: string;
  reply: {
    raw:    { setHeader: Function; write: Function; end: Function };
    status: (code: number) => { send: (body: unknown) => void };
  };
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
  if (!model) {
    reply.status(404).send({ error: "MODEL_NOT_FOUND", message: "النموذج غير موجود." });
    return;
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

  // Persist the user's turn. Only the assistant reply was ever saved
  // before (fire-and-forget, after the stream), so conversation history
  // was silently empty on reload even when the FK error didn't fire.
  const lastUserMessage = opts.messages.at(-1);
  if (lastUserMessage?.role === "user") {
    db.insert(messages).values({
      conversationId: opts.conversationId,
      role:           "user",
      content:        lastUserMessage.content,
      modelId,
    }).catch(console.error);
  }

  // Estimate token count to pre-validate
  const allText     = opts.messages.map((m) => m.content).join(" ");
  const estTokens   = estimateTokenCount(allText);
  const maxContext  = model.contextWindow * 0.95;

  if (estTokens > maxContext) {
    reply.status(400).send({
      error:   "CONTEXT_TOO_LONG",
      message: "رسالتك أطول من الحد المسموح. قلّل الرسالة أو اختر نموذجاً بسياق أوسع.",
    });
    return;
  }

  const requestId = crypto.randomUUID();
  let upstream: Response;
  const upstreamStartedAt = Date.now();

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
        messages:       opts.messages,
        stream:         true,
        stream_options: { include_usage: true },
      }),
      signal: AbortSignal.timeout(120_000), // 2 minute max
    });
  } catch (err: unknown) {
    recordUpstreamCall(model.provider, modelId, (Date.now() - upstreamStartedAt) / 1000, false);
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
  reply.raw.setHeader("Content-Type",      "text/plain; charset=utf-8");
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

        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          streamedContent += delta;
          reply.raw.write(delta);
        }

        if (parsed?.usage) {
          if (typeof parsed.usage.prompt_tokens === "number")     inputTokens  = parsed.usage.prompt_tokens;
          if (typeof parsed.usage.completion_tokens === "number") outputTokens = parsed.usage.completion_tokens;
        }
      }
    }
  } catch {
    // Stream interrupted — isPartial stays true
  } finally {
    streamingConnectionsActive.dec();
    reply.raw.end();
  }

  // Some gateway/provider combinations omit `usage` entirely even on a
  // clean finish (stream_options.include_usage isn't universally honored
  // downstream). Never let a missing usage object mean "bill nothing" —
  // fall back to the same char/4 estimate used for the pre-send estimate
  // shown in the UI. This is the last line of defense against a $0 chat.
  if (streamedContent.length > 0 && outputTokens === 0) {
    outputTokens = estimateTokenCount(streamedContent);
  }
  if (inputTokens === 0) {
    inputTokens = estimateTokenCount(opts.messages.map((m) => m.content).join(" "));
  }

  // Post-stream: deduct credits and save message (async, non-blocking)
  if (outputTokens > 0 || (isPartial && streamedContent.length > 0)) {
    const cost = calcCreditCost(model, inputTokens, outputTokens);

    deductCreditsAtomic(userId, cost, "Chat usage", {
      modelId, inputTokens, outputTokens, requestId,
    }).catch(console.error);
    recordCreditsSpent(modelId, cost);

    // Save assistant message
    db.insert(messages).values({
      conversationId:   opts.conversationId,
      role:             "assistant",
      content:          streamedContent,
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
