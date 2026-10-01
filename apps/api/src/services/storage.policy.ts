/**
 * P5.1: pure storage rules (no I/O): bucket definitions, limits, object-key shape and the
 * pre-URL validation. Everything here runs BEFORE a signed upload URL is issued; the bucket's
 * own fileSizeLimit / allowedMimeTypes (set by ensureBuckets) are the second layer.
 */
const MiB = 1024 * 1024;

export type BucketName = "attachments" | "audio";

export interface BucketPolicy {
  maxBytes:     number;
  allowedMimes: readonly string[];
}

export const BUCKETS: Record<BucketName, BucketPolicy> = {
  attachments: {
    maxBytes: 20 * MiB,
    // No SVG (script-capable), no archives, no executables, no macro-enabled Office files: never allowlisted (plan P5.2).
    allowedMimes: [
      "image/png", "image/jpeg", "image/webp", "image/gif",
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // P6.3c: more text-bearing documents. Each is verified against its REAL bytes (extraction/file-type.ts).
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/vnd.oasis.opendocument.presentation",
      "application/rtf",
    ],
  },
  audio: {
    maxBytes: 25 * MiB, // Whisper-compatible endpoints cap at 25 MB
    allowedMimes: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"],
  },
};

export const BUCKET_NAMES = Object.keys(BUCKETS) as BucketName[];

export const STORAGE_LIMITS = {
  maxTotalBytesPerUser:     200 * MiB,
  maxUploadsPerDay:         30,
  /** P5.3: voice notes are counted on their own (a chatty day must not block file attachments). */
  maxAudioUploadsPerDay:    100,
  /** A pending object never confirmed within this window is deleted. */
  orphanAfterMs:            60 * 60 * 1000,
  /** Safety net: P5.3 deletes audio right after transcription; anything older than this goes. */
  audioMaxAgeMs:            24 * 60 * 60 * 1000,
  /** Deleted rows are kept this long so deleting objects cannot reset the daily count. */
  purgeDeletedAfterMs:      2 * 24 * 60 * 60 * 1000,
  downloadUrlTtlSeconds:    300,
  maxDownloadUrlTtlSeconds: 900,
} as const;

export type StorageLimits = { -readonly [K in keyof typeof STORAGE_LIMITS]: number };

export type StorageErrorCode =
  | "STORAGE_DISABLED"
  | "INVALID_BUCKET"
  | "INVALID_MIME"
  | "INVALID_SIZE"
  | "FILE_TOO_LARGE"
  | "QUOTA_BYTES"
  | "QUOTA_DAILY"
  | "CONVERSATION_NOT_FOUND"
  | "OBJECT_NOT_FOUND"
  | "UPSTREAM";

export class StorageError extends Error {
  constructor(public readonly code: StorageErrorCode, message?: string) {
    super(message ?? code);
    this.name = "StorageError";
  }
}

/** "Audio/WebM; codecs=opus" -> "audio/webm" (MediaRecorder adds parameters). */
export function normalizeMime(mime: string): string {
  return mime.split(";")[0]!.trim().toLowerCase();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => UUID_RE.test(s);

/** P5.3: voice notes belong to no conversation; this keeps the key shape (and parseObjectKey) valid. */
export const NO_CONVERSATION_SEGMENT = "00000000-0000-0000-0000-000000000000";

/** `{userId}/{conversationId}/{objectId}` — the only key shape ever signed. */
export function buildObjectKey(userId: string, conversationId: string, objectId: string): string {
  return `${userId}/${conversationId}/${objectId}`;
}

export function parseObjectKey(key: string): { userId: string; conversationId: string; objectId: string } | null {
  const parts = key.split("/");
  if (parts.length !== 3 || !parts.every(isUuid)) return null;
  return { userId: parts[0]!, conversationId: parts[1]!, objectId: parts[2]! };
}

export type UploadValidation =
  | { ok: true; mime: string; policy: BucketPolicy }
  | { ok: false; code: Extract<StorageErrorCode, "INVALID_BUCKET" | "INVALID_MIME" | "INVALID_SIZE" | "FILE_TOO_LARGE"> };

export function validateUpload(input: { bucket: string; mimeType: string; sizeBytes: number }): UploadValidation {
  if (!(BUCKET_NAMES as string[]).includes(input.bucket)) return { ok: false, code: "INVALID_BUCKET" };
  const policy = BUCKETS[input.bucket as BucketName];
  const mime = normalizeMime(input.mimeType);
  if (!policy.allowedMimes.includes(mime)) return { ok: false, code: "INVALID_MIME" };
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) return { ok: false, code: "INVALID_SIZE" };
  if (input.sizeBytes > policy.maxBytes) return { ok: false, code: "FILE_TOO_LARGE" };
  return { ok: true, mime, policy };
}
