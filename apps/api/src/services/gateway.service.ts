import { config } from "../config";
import { calculateCreditCost, estimateTokenCount, MODEL_CATALOG } from "@ai-platform/config";
import { deductCreditsAtomic } from "./balance.service";
import { db, messages, conversations } from "@ai-platform/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

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
  reply:          { raw: { setHeader: Function; write: Function; end: Function } };
}

export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const { userId, model: modelId, reply } = opts;

  const model = MODEL_CATALOG.find((m) => m.id === modelId);
  if (!model) {
    reply.raw.write(`data: ${JSON.stringify({ error: "MODEL_NOT_FOUND" })}\n\n`);
    reply.raw.end();
    return;
  }

  // Estimate token count to pre-validate
  const allText     = opts.messages.map((m) => m.content).join(" ");
  const estTokens   = estimateTokenCount(allText);
  const maxContext  = model.contextWindow * 0.95;

  if (estTokens > maxContext) {
    reply.raw.write(`data: ${JSON.stringify({
      error:   "CONTEXT_TOO_LONG",
      message: "رسالتك أطول من الحد المسموح. قلّل الرسالة أو اختر نموذجاً بسياق أوسع.",
    })}\n\n`);
    reply.raw.end();
    return;
  }

  // Set streaming headers
  reply.raw.setHeader("Content-Type",    "text/event-stream");
  reply.raw.setHeader("Cache-Control",   "no-cache");
  reply.raw.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

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
    reply.raw.write(`data: ${JSON.stringify({
      error:   isTimeout ? "TIMEOUT" : "GATEWAY_ERROR",
      message: isTimeout ? "انتهت مهلة الطلب. حاول مجدداً." : "خطأ في الاتصال بالخادم.",
    })}\n\n`);
    reply.raw.end();
    return;
  }

  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    reply.raw.write(`data: ${JSON.stringify({
      error:   (errBody as Record<string, unknown>)?.error ?? "UPSTREAM_ERROR",
      message: ERROR_MESSAGES[upstream.status] ?? "حدث خطأ غير متوقع.",
      status:  upstream.status,
    })}\n\n`);
    reply.raw.end();
    return;
  }

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
      reply.raw.write(chunk);

      // Extract content from SSE delta chunks
      for (const match of chunk.matchAll(/"content":"((?:[^"\\]|\\.)*)"/g)) {
        streamedContent += (match[1] ?? "").replace(/\\n/g, "\n").replace(/\\"/g, '"');
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
    const cost = calculateCreditCost(modelId, inputTokens, outputTokens);

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
