/**
 * P6.3c: thin HTTP bridge for `attachments.*`, built exactly like the voice bridge (see
 * services/voice-http.ts for the full reasoning): the web proxy authenticates with the internal service
 * token, which only `authMiddleware` understands, so these routes sit behind it and call the existing
 * procedures in-process. No procedure, schema, quota or rule is duplicated; errors reuse
 * `toVoiceHttpError` (stable codes, nothing unexpected forwarded).
 *
 *   GET  /attachments/status      -> { available }   (storage configured; hides the attach button)
 *   POST /attachments/upload-url  -> attachments.createUploadUrl   { conversationId, fileName, mimeType, sizeBytes }
 *   POST /attachments/confirm     -> attachments.confirm           { attachmentId }
 *   POST /attachments/get         -> attachments.get               { attachmentId }  (polled until ready/failed)
 *
 * Only `get` is a POST on purpose: one body shape for the three actions, and no id in a URL or a log line.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { toVoiceHttpError } from "./voice-http";

export const ATTACHMENT_ACTIONS = ["upload-url", "confirm", "get"] as const;
export type AttachmentAction = (typeof ATTACHMENT_ACTIONS)[number];

export interface AttachmentsCaller {
  attachments: {
    createUploadUrl(input: unknown): Promise<unknown>;
    confirm(input: unknown): Promise<unknown>;
    get(input: unknown): Promise<unknown>;
  };
}

export async function runAttachmentAction(
  action: AttachmentAction,
  body: unknown,
  caller: AttachmentsCaller,
): Promise<{ status: number; body: unknown }> {
  const input = typeof body === "object" && body !== null && !Array.isArray(body) ? body : {};
  try {
    const out =
      action === "upload-url" ? await caller.attachments.createUploadUrl(input)
      : action === "confirm" ? await caller.attachments.confirm(input)
      : await caller.attachments.get(input);
    return { status: 200, body: out };
  } catch (err) {
    return toVoiceHttpError(err);
  }
}

export interface AttachmentsRoutesDeps {
  preHandler: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  makeCaller: (req: FastifyRequest) => AttachmentsCaller;
  isAvailable: () => Promise<boolean>;
}

export function registerAttachmentsRoutes(app: FastifyInstance, deps: AttachmentsRoutesDeps): void {
  app.get("/attachments/status", { preHandler: deps.preHandler }, async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    let available = false;
    try { available = await deps.isAvailable(); } catch { available = false; }
    return { available };
  });

  for (const action of ATTACHMENT_ACTIONS) {
    app.post(`/attachments/${action}`, { preHandler: deps.preHandler }, async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const result = await runAttachmentAction(action, req.body, deps.makeCaller(req));
      reply.status(result.status);
      return result.body;
    });
  }
}
