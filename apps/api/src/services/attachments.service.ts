/**
 * P5.2a: attachments on top of the P5.1 storage service: create an upload, confirm it (queues
 * extraction), report status, and run the extraction job. Using them in /chat (5.2b) lives in
 * chat-attachments.service.ts; nothing in this file touches chat, billing or the gateway.
 *
 * Imported by the tRPC router, which the Next.js app also loads: so NO static import of
 * ../config or ../jobs/queue here (the queue is reached through the injected `enqueue`, bound
 * lazily in getAttachmentsService()).
 */
import { and, eq, lt } from "drizzle-orm";
import { db, attachments } from "@ai-platform/db";
import { getStorageService, type StorageService } from "./storage.service";
import { BUCKETS } from "./storage.policy";
import {
  ATTACHMENT_LIMITS, AttachmentError, kindFromMime, sanitizeFileName,
  type AttachmentKind, type AttachmentStatus, type ExtractionErrorCode,
} from "./attachments.policy";
import { detectMime } from "../extraction/file-type";
import { runExtraction } from "../extraction/extraction.runner";
import type { ExtractResult } from "../extraction/extract";

const PREVIEW_CHARS = 300;
const DOWNLOAD_TIMEOUT_MS = 15_000;

export interface AttachmentView {
  id:             string;
  conversationId: string | null;
  fileName:       string;
  mimeType:       string;
  sizeBytes:      number;
  kind:           AttachmentKind;
  status:         AttachmentStatus;
  errorCode:      string | null;
  /** Characters of extracted text (null until ready). */
  textChars:      number | null;
  truncated:      boolean;
  /** First ~300 characters of the extracted text, for a quick "did it read my file" check. */
  preview:        string | null;
  createdAt:      Date;
}

export interface AttachmentsDeps {
  storage: Pick<StorageService, "requestUpload" | "confirmUpload" | "getDownloadUrl" | "discardConfirmed">;
  /** Queues the extraction job for one attachment. Must be idempotent per id. */
  enqueue: (attachmentId: string) => Promise<void>;
  extract?: (mime: string, bytes: Uint8Array) => Promise<ExtractResult>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

type Row = typeof attachments.$inferSelect;

function toView(r: Row): AttachmentView {
  return {
    id: r.id, conversationId: r.conversationId, fileName: r.fileName, mimeType: r.mimeType,
    sizeBytes: r.sizeBytes, kind: r.kind as AttachmentKind, status: r.status as AttachmentStatus,
    errorCode: r.errorCode, textChars: r.extractedChars, truncated: r.truncated,
    preview: r.extractedText ? r.extractedText.slice(0, PREVIEW_CHARS) : null,
    createdAt: r.createdAt,
  };
}

/** Reads a response body with a hard byte cap. null = too large. */
export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

export function createAttachmentsService(deps: AttachmentsDeps) {
  const { storage } = deps;
  const now = deps.now ?? (() => new Date());
  const extract = deps.extract ?? ((mime: string, bytes: Uint8Array) => runExtraction(mime, bytes));
  const doFetch = deps.fetchImpl ?? fetch;

  async function load(userId: string, id: string): Promise<Row> {
    const [row] = await db.select().from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.userId, userId))).limit(1);
    if (!row) throw new AttachmentError("NOT_FOUND"); // foreign and missing are indistinguishable
    return row;
  }

  /** processing -> failed, text cleared, then the unusable object is deleted right away. */
  async function fail(row: Pick<Row, "id" | "userId">, code: ExtractionErrorCode): Promise<void> {
    const changed = await db.update(attachments)
      .set({ status: "failed", errorCode: code, extractedText: null, extractedChars: null, updatedAt: now() })
      .where(and(eq(attachments.id, row.id), eq(attachments.status, "processing")))
      .returning({ id: attachments.id });
    if (changed.length > 0) {
      await storage.discardConfirmed({ userId: row.userId, objectId: row.id }).catch(() => {});
    }
  }

  return {
    /** Validates + signs via the storage service (quotas, type, size), then records the attachment. */
    async createUpload(input: { userId: string; conversationId: string; fileName: string; mimeType: string; sizeBytes: number }) {
      const ticket = await storage.requestUpload({
        userId: input.userId, conversationId: input.conversationId,
        bucket: "attachments", mimeType: input.mimeType, sizeBytes: input.sizeBytes,
      });
      const kind = kindFromMime(ticket.mimeType);
      const fileName = sanitizeFileName(input.fileName);
      // If this insert fails the pending storage row is an orphan: the sweep removes it within ~1.5 h.
      await db.insert(attachments).values({
        id: ticket.objectId, userId: input.userId, conversationId: input.conversationId,
        fileName, mimeType: ticket.mimeType, sizeBytes: input.sizeBytes, kind, status: "uploading",
        createdAt: now(), updatedAt: now(),
      });
      return {
        attachmentId: ticket.objectId, uploadUrl: ticket.uploadUrl, mimeType: ticket.mimeType,
        maxBytes: ticket.maxBytes, kind, fileName,
      };
    },

    /** After the browser's PUT: verify the object, then queue extraction. Safe to call twice. */
    async confirm(input: { userId: string; attachmentId: string }): Promise<AttachmentView> {
      const row = await load(input.userId, input.attachmentId);
      if (row.status !== "uploading") return toView(row); // already confirmed / processed

      const { sizeBytes } = await storage.confirmUpload({ userId: input.userId, objectId: row.id });
      const claimed = await db.update(attachments)
        .set({ status: "processing", sizeBytes, updatedAt: now() })
        .where(and(eq(attachments.id, row.id), eq(attachments.status, "uploading")))
        .returning();
      if (claimed.length === 0) return toView(await load(input.userId, row.id)); // concurrent confirm won

      try {
        await deps.enqueue(row.id);
      } catch {
        // Nothing will ever process it: put it back so the client can retry confirm (idempotent).
        await db.update(attachments).set({ status: "uploading", updatedAt: now() })
          .where(and(eq(attachments.id, row.id), eq(attachments.status, "processing")));
        throw new AttachmentError("QUEUE_UNAVAILABLE");
      }
      return toView(claimed[0]!);
    },

    async get(input: { userId: string; attachmentId: string }): Promise<AttachmentView> {
      return toView(await load(input.userId, input.attachmentId));
    },

    /**
     * The queued job. Idempotent: only a row still `processing` is worked on, and the final
     * write is guarded the same way (a sweep that failed it meanwhile wins). Never throws for
     * a bad file: that is a `failed` row, not a job failure (no pointless retry).
     */
    async process(attachmentId: string): Promise<"ready" | "failed" | "skipped"> {
      const [row] = await db.select().from(attachments).where(eq(attachments.id, attachmentId)).limit(1);
      if (!row || row.status !== "processing") return "skipped";

      let bytes: Uint8Array | null;
      try {
        const { url } = await storage.getDownloadUrl({ userId: row.userId, objectId: row.id, ttlSeconds: 120 });
        const res = await doFetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
        bytes = res.ok ? await readCapped(res, Math.min(row.sizeBytes, BUCKETS.attachments.maxBytes)) : null;
      } catch {
        bytes = null;
      }
      if (!bytes) { await fail(row, "DOWNLOAD_FAILED"); return "failed"; }

      if (row.kind === "image") {
        // Real-bytes check only here. Metadata stripping and the dimension cap run at chat time (image-sanitize.ts).
        if (detectMime(bytes) !== row.mimeType) { await fail(row, "TYPE_MISMATCH"); return "failed"; }
        const ok = await db.update(attachments)
          .set({ status: "ready", errorCode: null, updatedAt: now() })
          .where(and(eq(attachments.id, row.id), eq(attachments.status, "processing")))
          .returning({ id: attachments.id });
        return ok.length > 0 ? "ready" : "skipped";
      }

      if (row.kind !== "document") { await fail(row, "TYPE_MISMATCH"); return "failed"; }
      const result = await extract(row.mimeType, bytes);
      if (!result.ok) { await fail(row, result.code); return "failed"; }

      const ok = await db.update(attachments)
        .set({
          status: "ready", errorCode: null, extractedText: result.text,
          extractedChars: result.text.length, truncated: result.truncated, updatedAt: now(),
        })
        .where(and(eq(attachments.id, row.id), eq(attachments.status, "processing")))
        .returning({ id: attachments.id });
      return ok.length > 0 ? "ready" : "skipped";
    },

    /** Scheduled: `processing` for too long means the process died mid-job. Returns how many. */
    async sweepStalled(): Promise<number> {
      const cutoff = new Date(now().getTime() - ATTACHMENT_LIMITS.stalledAfterMs);
      const stuck = await db.select({ id: attachments.id, userId: attachments.userId }).from(attachments)
        .where(and(eq(attachments.status, "processing"), lt(attachments.updatedAt, cutoff))).limit(200);
      for (const r of stuck) await fail(r, "STALLED");
      return stuck.length;
    },
  };
}

export type AttachmentsService = ReturnType<typeof createAttachmentsService>;

let shared: AttachmentsService | null | undefined;

/** Bound to the env-configured storage and the reports queue, or null when storage is off. */
export function getAttachmentsService(): AttachmentsService | null {
  if (shared === undefined) {
    const storage = getStorageService();
    shared = storage
      ? createAttachmentsService({
          storage,
          enqueue: async (id) => {
            // Dynamic: jobs/queue pulls in the Zod-validated config and opens Redis at import.
            const { reportQueue } = await import("../jobs/queue");
            // One attempt: a bad file is a `failed` row, and a crash is caught by sweepStalled.
            await reportQueue.add("extractAttachment", { attachmentId: id }, { jobId: `extract-${id}`, attempts: 1 });
          },
        })
      : null;
  }
  return shared;
}
