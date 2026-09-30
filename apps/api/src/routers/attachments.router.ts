/**
 * P5.2a: attachments API. Works only where the storage service-role key is configured, i.e. the
 * api service (Render). The same appRouter is also mounted by the Next.js app, where storage is
 * deliberately NOT configured: there every procedure answers STORAGE_DISABLED.
 *
 * Error messages are stable codes for the frontend to map to copy; do not reword.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./trpc";
import { getAttachmentsService, type AttachmentsService } from "../services/attachments.service";
import { AttachmentError } from "../services/attachments.policy";
import { StorageError, BUCKETS, type StorageErrorCode } from "../services/storage.policy";

const STORAGE_TRPC: Record<StorageErrorCode, TRPCError["code"]> = {
  STORAGE_DISABLED:      "SERVICE_UNAVAILABLE",
  INVALID_BUCKET:        "BAD_REQUEST",
  INVALID_MIME:          "UNSUPPORTED_MEDIA_TYPE",
  INVALID_SIZE:          "BAD_REQUEST",
  FILE_TOO_LARGE:        "PAYLOAD_TOO_LARGE",
  QUOTA_BYTES:           "TOO_MANY_REQUESTS",
  QUOTA_DAILY:           "TOO_MANY_REQUESTS",
  CONVERSATION_NOT_FOUND: "NOT_FOUND",
  OBJECT_NOT_FOUND:      "NOT_FOUND",
  UPSTREAM:              "BAD_GATEWAY",
};

function toTrpcError(err: unknown): never {
  if (err instanceof TRPCError) throw err;
  if (err instanceof StorageError) throw new TRPCError({ code: STORAGE_TRPC[err.code], message: err.code });
  if (err instanceof AttachmentError) {
    const code = err.code === "NOT_FOUND" ? "NOT_FOUND" : "SERVICE_UNAVAILABLE";
    throw new TRPCError({ code, message: err.code });
  }
  throw err; // unexpected: becomes INTERNAL_SERVER_ERROR and is reported
}

function service(): AttachmentsService {
  const svc = getAttachmentsService();
  if (!svc) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "STORAGE_DISABLED" });
  return svc;
}

const attachmentId = z.object({ attachmentId: z.string().uuid() });

export const attachmentsRouter = router({
  createUploadUrl: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      fileName:       z.string().min(1).max(255),
      mimeType:       z.string().min(1).max(100),
      sizeBytes:      z.number().int().min(1).max(BUCKETS.attachments.maxBytes),
    }))
    .mutation(async ({ ctx, input }) => {
      try { return await service().createUpload({ userId: ctx.user.id, ...input }); }
      catch (err) { return toTrpcError(err); }
    }),

  confirm: protectedProcedure
    .input(attachmentId)
    .mutation(async ({ ctx, input }) => {
      try { return await service().confirm({ userId: ctx.user.id, attachmentId: input.attachmentId }); }
      catch (err) { return toTrpcError(err); }
    }),

  get: protectedProcedure
    .input(attachmentId)
    .query(async ({ ctx, input }) => {
      try { return await service().get({ userId: ctx.user.id, attachmentId: input.attachmentId }); }
      catch (err) { return toTrpcError(err); }
    }),
});
