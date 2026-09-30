/**
 * P5.2a: pure attachment rules (no I/O, no config/env): limits, error codes, file-name
 * sanitizing and kind mapping. Importable from the Next.js process (the appRouter is shared).
 */
export const ATTACHMENT_LIMITS = {
  /** Hard cap on stored extracted text. 5.2b cuts again to the chosen model's context window. */
  maxExtractedChars:   400_000,
  /** One extraction: hard wall-clock limit, then the worker thread is terminated. */
  extractTimeoutMs:    20_000,
  /** V8 old-generation cap of the extraction worker thread. */
  workerHeapMb:        256,
  /** A DOCX's document.xml may not inflate beyond this (zip-bomb guard). */
  maxDocxXmlBytes:     30 * 1024 * 1024,
  maxZipEntries:       5_000,
  /** `processing` for longer than this = the worker process died; the sweep fails it. */
  stalledAfterMs:      10 * 60 * 1000,
  maxFileNameLength:   255,
} as const;

export type AttachmentKind   = "image" | "document" | "audio";
export type AttachmentStatus = "uploading" | "processing" | "ready" | "failed";

export type ExtractionErrorCode =
  | "TYPE_MISMATCH"     // real bytes are not what the client declared
  | "CORRUPT"           // declared type is right but the file cannot be parsed (incl. encrypted PDF)
  | "NO_TEXT"           // parsed fine, zero text (scanned PDF, empty file)
  | "TEXT_ENCODING"     // text/plain that is not valid UTF-8
  | "TOO_COMPLEX"       // docx with too many entries / inflates too far
  | "TIMEOUT"
  | "MEMORY"
  | "DOWNLOAD_FAILED"   // could not read the object back from storage
  | "EXTRACT_FAILED"    // anything else thrown by the extractor
  | "OBJECT_DELETED"    // the stored object was removed (conversation/account deleted, orphan)
  | "STALLED";          // processing never finished (process died)

export type AttachmentErrorCode =
  | "STORAGE_DISABLED" | "NOT_FOUND" | "QUEUE_UNAVAILABLE" | "INVALID_KIND";

export class AttachmentError extends Error {
  constructor(public readonly code: AttachmentErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AttachmentError";
  }
}

export function kindFromMime(mime: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Client-supplied name -> safe display string. Strips path parts, control/bidi characters and
 * anything that could break out of the delimited document block in 5.2b (angle brackets, quotes,
 * backticks, newlines). Never used as a storage key.
 */
export function sanitizeFileName(raw: string | undefined | null): string {
  let s = (raw ?? "").normalize("NFC");
  s = s.split(/[\\/]/).pop() ?? "";
  // C0/C1 controls, zero-width and bidi override/isolate characters, line/paragraph separators.
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/g, "");
  s = s.replace(/[<>"'`|?*:]/g, "_").replace(/\s+/g, " ").trim();
  s = s.replace(/^\.+/, "");
  if (s.length > ATTACHMENT_LIMITS.maxFileNameLength) {
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 && s.length - dot <= 12 ? s.slice(dot) : "";
    s = s.slice(0, ATTACHMENT_LIMITS.maxFileNameLength - ext.length) + ext;
  }
  return s || "file";
}

/** Drops NUL and other C0 controls (keeps \n \r \t), normalizes line endings, trims. */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Cuts at the cap without splitting a surrogate pair. */
export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  let end = maxChars;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1; // do not end on a lone high surrogate
  return { text: text.slice(0, end), truncated: true };
}
