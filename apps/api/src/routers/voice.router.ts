/**
 * P5.3: voice input API. Like `attachments.*`, this works only where the storage service-role key
 * is configured (the api service on Render); on the Next.js host every procedure answers
 * STORAGE_DISABLED. How the browser reaches it is the P6.3 decision already open for attachments.
 *
 *   voice.createUploadUrl -> browser PUTs the recording -> voice.confirm -> voice.transcribe
 *
 * `transcribe` is a BILLED operation: it runs under the P1.2 per-user lock (fail closed) and the
 * transcript comes back as plain text for an editable composer; it is never saved or auto-sent.
 * Error messages are stable codes for the frontend to map to copy; do not reword.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./trpc";
import { getStorageService, type StorageService } from "../services/storage.service";
import { StorageError, type StorageErrorCode } from "../services/storage.policy";
import { TRANSCRIPTION_LIMITS, TranscriptionError, type TranscriptionErrorCode } from "../services/transcription.policy";
import { getTranscriptionService } from "../services/transcription.service";
import {
  withBilledOperationLock, BillingLockBusyError, BillingLockUnavailableError,
} from "../services/billing-lock.service";

const STORAGE_TRPC: Record<StorageErrorCode, TRPCError["code"]> = {
  STORAGE_DISABLED:       "SERVICE_UNAVAILABLE",
  INVALID_BUCKET:         "BAD_REQUEST",
  INVALID_MIME:           "UNSUPPORTED_MEDIA_TYPE",
  INVALID_SIZE:           "BAD_REQUEST",
  FILE_TOO_LARGE:         "PAYLOAD_TOO_LARGE",
  QUOTA_BYTES:            "TOO_MANY_REQUESTS",
  QUOTA_DAILY:            "TOO_MANY_REQUESTS",
  CONVERSATION_NOT_FOUND: "NOT_FOUND",
  OBJECT_NOT_FOUND:       "NOT_FOUND",
  UPSTREAM:               "BAD_GATEWAY",
};

const TRANSCRIPTION_TRPC: Record<TranscriptionErrorCode, TRPCError["code"]> = {
  TRANSCRIPTION_NOT_CONFIGURED: "SERVICE_UNAVAILABLE",
  AUDIO_NOT_FOUND:              "NOT_FOUND",
  AUDIO_TOO_LONG:               "PAYLOAD_TOO_LARGE",
  AUDIO_UNUSABLE:               "BAD_REQUEST",
  INSUFFICIENT_BALANCE:         "PRECONDITION_FAILED", // the /chat equivalent is HTTP 402
  TRANSCRIPTION_UNAVAILABLE:    "SERVICE_UNAVAILABLE",
  TRANSCRIPTION_FAILED:         "BAD_GATEWAY",
};

function toTrpcError(err: unknown): never {
  if (err instanceof TRPCError) throw err;
  if (err instanceof StorageError) throw new TRPCError({ code: STORAGE_TRPC[err.code], message: err.code });
  if (err instanceof TranscriptionError) throw new TRPCError({ code: TRANSCRIPTION_TRPC[err.code], message: err.code });
  if (err instanceof BillingLockBusyError) throw new TRPCError({ code: "CONFLICT", message: "REQUEST_IN_PROGRESS" });
  if (err instanceof BillingLockUnavailableError) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "BILLING_LOCK_UNAVAILABLE" });
  throw err; // unexpected: becomes INTERNAL_SERVER_ERROR and is reported
}

function storage(): StorageService {
  const svc = getStorageService();
  if (!svc) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "STORAGE_DISABLED" });
  return svc;
}

const audioId = z.object({ audioId: z.string().uuid() });

export const voiceRouter = router({
  createUploadUrl: protectedProcedure
    .input(z.object({
      mimeType:  z.string().min(1).max(100),
      sizeBytes: z.number().int().min(1).max(TRANSCRIPTION_LIMITS.maxBytes),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const t = await storage().requestUpload({ userId: ctx.user.id, bucket: "audio", ...input });
        return { audioId: t.objectId, uploadUrl: t.uploadUrl, mimeType: t.mimeType, maxBytes: t.maxBytes };
      } catch (err) { return toTrpcError(err); }
    }),

  confirm: protectedProcedure
    .input(audioId)
    .mutation(async ({ ctx, input }) => {
      try {
        const r = await storage().confirmUpload({ userId: ctx.user.id, objectId: input.audioId });
        return { audioId: r.objectId, sizeBytes: r.sizeBytes };
      } catch (err) { return toTrpcError(err); }
    }),

  transcribe: protectedProcedure
    .input(audioId.extend({
      /** MediaRecorder's own timing. Untrusted: it can only raise the estimate, never lower the bill. */
      durationMs: z.number().int().min(1).max(3_600_000).optional(),
      /** ISO-639-1 hint such as "ar" or "en". Anything else is dropped server-side. */
      language:   z.string().max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        storage(); // STORAGE_DISABLED before taking the lock
        const svc = getTranscriptionService();
        return await withBilledOperationLock(ctx.user.id, (lock) =>
          svc.transcribe({
            userId: ctx.user.id, audioId: input.audioId, requestId: lock.requestId,
            durationMs: input.durationMs, language: input.language,
          }),
        );
      } catch (err) { return toTrpcError(err); }
    }),
});
