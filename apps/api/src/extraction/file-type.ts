/**
 * P5.2a: type check on the REAL bytes. The client's claimed MIME type (and the storage object's
 * recorded one) is only a claim; this decides what the file actually is. No dependency beyond
 * fflate's central-directory reader for DOCX.
 */
import { unzipSync } from "fflate";
import { ATTACHMENT_LIMITS } from "../services/attachments.policy";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const startsWith = (b: Uint8Array, sig: number[], at = 0): boolean =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, at: number, len: number): string =>
  String.fromCharCode(...b.subarray(at, at + len));

/** Names in a ZIP's central directory, without inflating anything. null = not a readable zip. */
export function listZipEntries(bytes: Uint8Array): string[] | null {
  const names: string[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        names.push(f.name);
        if (names.length > ATTACHMENT_LIMITS.maxZipEntries) throw new Error("too many entries");
        return false; // never inflate here
      },
    });
  } catch {
    return null;
  }
  return names;
}

/** Valid UTF-8 (optional BOM), no NUL bytes. */
export function looksLikeUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * The MIME type the bytes really are, limited to the attachment allowlist.
 * null = not one of the allowed types (executables, archives, SVG, ... all land here).
 */
export function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  // PDF readers accept the header anywhere in the first 1024 bytes.
  const head = ascii(bytes, 0, Math.min(bytes.length, 1024));
  if (head.includes("%PDF-")) return "application/pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const names = listZipEntries(bytes);
    if (names && names.includes("[Content_Types].xml") && names.includes("word/document.xml")) return DOCX_MIME;
    return null; // some other zip (xlsx, pptx, jar, plain archive): never allowed
  }
  if (looksLikeUtf8Text(bytes)) return "text/plain";
  return null;
}
