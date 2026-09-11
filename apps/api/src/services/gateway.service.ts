import { config } from "../config";
import { CREDIT_VALUE_USD, estimateTokenCount } from "@ai-platform/config";
import { deductCreditsAtomic } from "./balance.service";
import { db, messages, conversations, models } from "@ai-platform/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";

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
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    reply.status(isTimeout ? 504 : 502).send({
      error:   isTimeout ? "TIMEOUT" : "GATEWAY_ERROR",
      message: isTimeout ? "انتهت مهلة الطلب. حاول مجدداً." : "خطأ في الاتصال بالخادم.",
    });
    return;
  }

  if (!upstream.ok) {
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
  const reader          = upstream.body!.getReader();
  const decoder         = new TextDecoder();
  let inputTokens       = 0;
  let outputTokens      = 0;
  let streamedContent   = "";
  let isPartial         = true;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { isPartial = false; break; }

      const chunk = decoder.decode(value, { stream: true });

      // Extract content deltas from the upstream SSE chunk and forward
      // ONLY the plain text — not the surrounding OpenAI JSON/SSE framing.
      for (const match of chunk.matchAll(/"content":"((?:[^"\\]|\\.)*)"/g)) {
        const delta = (match[1] ?? "").replace(/\\n/g, "\n").replace(/\\"/g, '"');
        streamedContent += delta;
        reply.raw.write(delta);
      }

      // Extract usage stats from final chunk
      const usageMatch = chunk.match(/"prompt_tokens":(\d+)[^}]*"completion_tokens":(\d+)/);
      if (usageMatch) {
        inputTokens  = parseInt(usageMatch[1] ?? "0");
        outputTokens = parseInt(usageMatch[2] ?? "0");
      }
    }
  } catch {
    // Stream interrupted — isPartial stays true
  } finally {
    reply.raw.end();
  }

  // Post-stream: deduct credits and save message (async, non-blocking)
  if (outputTokens > 0 || (isPartial && streamedContent.length > 0)) {
    const cost = calcCreditCost(model, inputTokens, outputTokens);

    deductCreditsAtomic(userId, cost, "Chat usage", {
      modelId, inputTokens, outputTokens, requestId,
    }).catch(console.error);

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
