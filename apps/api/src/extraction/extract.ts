/**
 * P5.2a: text extraction for txt / PDF / DOCX. Pure function of (declared mime, bytes): no DB,
 * no network, no config. It runs INSIDE an isolated worker thread (extract.worker.ts) in
 * production; tests call it directly.
 *
 * The output is untrusted document text. It is cleaned of control characters here and, in 5.2b,
 * wrapped in a delimited "untrusted document" block: never system text.
 */
import { unzipSync } from "fflate";
import { getDocumentProxy, extractText as pdfExtractText } from "unpdf";
import { ATTACHMENT_LIMITS, cleanExtractedText, truncateText, type ExtractionErrorCode } from "../services/attachments.policy";
import { DOCX_MIME, detectMime, listZipEntries } from "./file-type";

export type ExtractResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; code: ExtractionErrorCode };

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : "";
    }
    return XML_ENTITIES[e] ?? m;
  });
}

/** word/document.xml -> plain text: runs (<w:t>), tabs, line breaks, paragraph ends. */
export function docxXmlToText(xml: string): string {
  const out: string[] = [];
  // One pass over the tags we care about; everything else is skipped. No nested quantifiers.
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/>|<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) out.push(decodeXmlEntities(m[1]));
    else if (m[0].startsWith("<w:tab")) out.push("\t");
    else if (m[0].startsWith("<w:br")) out.push("\n");
    else out.push("\n");
  }
  return out.join("");
}

function extractDocx(bytes: Uint8Array): ExtractResult {
  const names = listZipEntries(bytes);
  if (!names) return { ok: false, code: "CORRUPT" };
  if (names.length > ATTACHMENT_LIMITS.maxZipEntries) return { ok: false, code: "TOO_COMPLEX" };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      // Inflate ONE entry, and only if its declared size is sane.
      filter: (f) => f.name === "word/document.xml" && f.originalSize <= ATTACHMENT_LIMITS.maxDocxXmlBytes,
    });
  } catch {
    return { ok: false, code: "CORRUPT" };
  }
  const xmlBytes = files["word/document.xml"];
  if (!xmlBytes) return { ok: false, code: "TOO_COMPLEX" }; // present but filtered out by the size cap
  if (xmlBytes.length > ATTACHMENT_LIMITS.maxDocxXmlBytes) return { ok: false, code: "TOO_COMPLEX" };
  return { ok: true, text: docxXmlToText(new TextDecoder("utf-8").decode(xmlBytes)), truncated: false };
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes)); // copy: pdf.js may detach the buffer
    const r = await pdfExtractText(pdf, { mergePages: true });
    const text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
    return { ok: true, text, truncated: false };
  } catch {
    return { ok: false, code: "CORRUPT" }; // also what an encrypted/password PDF ends up as
  }
}

function extractPlain(bytes: Uint8Array): ExtractResult {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, truncated: false };
  } catch {
    return { ok: false, code: "TEXT_ENCODING" };
  }
}

/**
 * `declaredMime` is what was recorded at upload (already checked against the allowlist). The
 * real bytes must agree with it, otherwise TYPE_MISMATCH. Images are not extracted here.
 */
export async function extractDocumentText(declaredMime: string, bytes: Uint8Array): Promise<ExtractResult> {
  const actual = detectMime(bytes);
  if (actual === null || actual !== declaredMime) return { ok: false, code: "TYPE_MISMATCH" };

  let raw: ExtractResult;
  if (declaredMime === "application/pdf") raw = await extractPdf(bytes);
  else if (declaredMime === DOCX_MIME)    raw = extractDocx(bytes);
  else if (declaredMime === "text/plain") raw = extractPlain(bytes);
  else return { ok: false, code: "TYPE_MISMATCH" }; // images and anything else: not a text document

  if (!raw.ok) return raw;
  const cleaned = cleanExtractedText(raw.text);
  if (cleaned.length === 0) return { ok: false, code: "NO_TEXT" };
  const cut = truncateText(cleaned, ATTACHMENT_LIMITS.maxExtractedChars);
  return { ok: true, text: cut.text, truncated: cut.truncated };
}
