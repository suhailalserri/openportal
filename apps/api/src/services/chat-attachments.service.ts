/**
 * P5.2b: resolves `attachmentIds` of a /chat request into what goes to the provider:
 * document text (from `extractedText`) and sanitized images (read back from storage).
 *
 * Runs in streamChat right after the model lookup and BEFORE the conversation/user-row insert,
 * so a rejected request never saves a user message. Every failure is a ChatAttachmentError with
 * a stable code (never a silent drop).
 *
 * Loaded lazily by gateway.service.ts (only when attachmentIds is present): it imports the DB
 * `attachments` table and the storage service, which old callers never need.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, attachments } from "@ai-platform/db";
import { getStorageService, type StorageService } from "./storage.service";
import { readCapped } from "./attachments.service";
import { detectMime } from "../extraction/file-type";
import { sanitizeImage } from "./image-sanitize";
import {
  CHAT_ATTACHMENT_LIMITS, ChatAttachmentError,
  type DocumentInput,
} from "./chat-attachments.policy";

export interface ResolvedAttachments {
  documents: DocumentInput[];
  /** `data:` URLs of sanitized images, in request order. */
  images: string[];
}

export interface ResolveDeps {
  storage?: Pick<StorageService, "getDownloadUrl"> | null;
  fetchImpl?: typeof fetch;
}

export interface ResolveArgs {
  userId: string;
  conversationId: string;
  ids: string[];
  model: { supportsVision: boolean; categories: string[] };
}

const DOWNLOAD_TIMEOUT_MS = 15_000;

export function modelSupportsVision(model: ResolveArgs["model"]): boolean {
  return model.supportsVision || model.categories.includes("vision");
}

export async function resolveChatAttachments(args: ResolveArgs, deps: ResolveDeps = {}): Promise<ResolvedAttachments> {
  const ids = [...new Set(args.ids)];
  if (ids.length > CHAT_ATTACHMENT_LIMITS.maxPerMessage) throw new ChatAttachmentError("TOO_MANY_ATTACHMENTS");

  const rows = await db.select().from(attachments)
    .where(and(eq(attachments.userId, args.userId), inArray(attachments.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Foreign, missing and "belongs to another conversation" are deliberately indistinguishable.
  const ordered = ids.map((id) => byId.get(id));
  if (ordered.some((r) => !r || r.conversationId !== args.conversationId)) throw new ChatAttachmentError("ATTACHMENT_NOT_FOUND");
  const list = ordered as NonNullable<(typeof ordered)[number]>[];

  if (list.some((r) => r.kind === "audio")) throw new ChatAttachmentError("ATTACHMENT_UNSUPPORTED");
  if (list.some((r) => r.status !== "ready")) throw new ChatAttachmentError("ATTACHMENT_NOT_READY");
  if (list.some((r) => r.kind === "image") && !modelSupportsVision(args.model)) throw new ChatAttachmentError("VISION_NOT_SUPPORTED");
  if (list.some((r) => r.kind === "image" && r.sizeBytes > CHAT_ATTACHMENT_LIMITS.imageMaxBytes)) throw new ChatAttachmentError("ATTACHMENT_UNSUPPORTED");

  const documents: DocumentInput[] = [];
  const images: string[] = [];
  const storage = deps.storage === undefined ? getStorageService() : deps.storage;
  const doFetch = deps.fetchImpl ?? fetch;

  for (const r of list) {
    if (r.kind === "document") {
      if (!r.extractedText) throw new ChatAttachmentError("ATTACHMENT_NOT_READY");
      documents.push({ fileName: r.fileName, text: r.extractedText, truncatedAtExtract: r.truncated });
      continue;
    }

    // image
    if (!storage) throw new ChatAttachmentError("ATTACHMENT_NOT_READY");
    let bytes: Uint8Array | null = null;
    try {
      const { url } = await storage.getDownloadUrl({ userId: r.userId, objectId: r.id, ttlSeconds: 120 });
      const res = await doFetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      bytes = res.ok ? await readCapped(res, CHAT_ATTACHMENT_LIMITS.imageMaxBytes) : null;
    } catch {
      bytes = null;
    }
    if (!bytes) throw new ChatAttachmentError("ATTACHMENT_NOT_READY");

    const realMime = detectMime(bytes);
    if (!realMime || realMime !== r.mimeType) throw new ChatAttachmentError("ATTACHMENT_UNSUPPORTED");
    const clean = sanitizeImage(bytes, realMime);
    if (!clean.ok) throw new ChatAttachmentError("ATTACHMENT_UNSUPPORTED");
    images.push(`data:${realMime};base64,${Buffer.from(clean.bytes).toString("base64")}`);
  }

  return { documents, images };
}
