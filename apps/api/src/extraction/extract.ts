/**
 * P5.2a: text extraction for txt / PDF / DOCX (P6.3c: + xlsx, pptx, OpenDocument, RTF). Pure function of (declared mime, bytes): no DB,
 * no network, no config. It runs INSIDE an isolated worker thread (extract.worker.ts) in
 * production; tests call it directly.
 *
 * The output is untrusted document text. It is cleaned of control characters here and, in 5.2b,
 * wrapped in a delimited "untrusted document" block: never system text.
 */
import { unzipSync } from "fflate";
import { getDocumentProxy, extractText as pdfExtractText } from "unpdf";
import { ATTACHMENT_LIMITS, cleanExtractedText, truncateText, type ExtractionErrorCode } from "../services/attachments.policy";
import {
  DOCX_MIME, ODP_MIME, ODS_MIME, ODT_MIME, PPTX_MIME, RTF_MIME, XLSX_MIME, detectMime, listZipEntries,
} from "./file-type";
import {
  decodeXmlEntities, odfContentToText, parseSharedStrings, pptxSlideToText, rtfToText, xlsxSheetNames, xlsxSheetToText,
} from "./office-text";

export type ExtractResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; code: ExtractionErrorCode };

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

// ── P6.3c: zip-based Office formats ─────────────────────────────────────────

type ZipRead = { ok: true; files: Record<string, Uint8Array> } | { ok: false; code: ExtractionErrorCode };

/**
 * Inflates ONLY the wanted entries, each under the per-entry cap and all together under the total
 * cap (zip-bomb guards, same idea as DOCX but for formats with many parts).
 */
function readZipParts(bytes: Uint8Array, want: (name: string) => boolean): ZipRead {
  const names = listZipEntries(bytes);
  if (!names) return { ok: false, code: "CORRUPT" };
  if (names.length > ATTACHMENT_LIMITS.maxZipEntries) return { ok: false, code: "TOO_COMPLEX" };
  let total = 0;
  let refused = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (!want(f.name)) return false;
        total += f.originalSize;
        if (f.originalSize > ATTACHMENT_LIMITS.maxDocxXmlBytes || total > ATTACHMENT_LIMITS.maxZipInflatedBytes) {
          refused = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    return { ok: false, code: "CORRUPT" };
  }
  if (refused) return { ok: false, code: "TOO_COMPLEX" };
  for (const f of Object.values(files)) if (f.length > ATTACHMENT_LIMITS.maxDocxXmlBytes) return { ok: false, code: "TOO_COMPLEX" };
  return { ok: true, files };
}

const utf8 = (b: Uint8Array | undefined): string => (b ? new TextDecoder("utf-8").decode(b) : "");
const partNumber = (name: string): number => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);

function extractXlsx(bytes: Uint8Array): ExtractResult {
  const r = readZipParts(bytes, (n) => n === "xl/workbook.xml" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!r.ok) return r;
  const sheetFiles = Object.keys(r.files).filter((n) => n.startsWith("xl/worksheets/")).sort((a, b) => partNumber(a) - partNumber(b));
  if (sheetFiles.length === 0) return { ok: false, code: "CORRUPT" };
  const shared = parseSharedStrings(utf8(r.files["xl/sharedStrings.xml"]));
  const names = xlsxSheetNames(utf8(r.files["xl/workbook.xml"]));
  const out: string[] = [];
  let chars = 0;
  for (const [i, f] of sheetFiles.slice(0, ATTACHMENT_LIMITS.maxOfficeParts).entries()) {
    const body = xlsxSheetToText(utf8(r.files[f]), shared, ATTACHMENT_LIMITS.maxExtractedChars - chars);
    if (!body) continue;
    out.push(`## ${names[i] ?? `Sheet ${i + 1}`}\n${body}`);
    chars += body.length;
    if (chars >= ATTACHMENT_LIMITS.maxExtractedChars) break;
  }
  return { ok: true, text: out.join("\n\n"), truncated: false };
}

function extractPptx(bytes: Uint8Array): ExtractResult {
  const r = readZipParts(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  if (!r.ok) return r;
  const slides = Object.keys(r.files).sort((a, b) => partNumber(a) - partNumber(b)).slice(0, ATTACHMENT_LIMITS.maxOfficeParts);
  if (slides.length === 0) return { ok: false, code: "CORRUPT" };
  const out: string[] = [];
  for (const f of slides) {
    const t = pptxSlideToText(utf8(r.files[f]));
    if (t) out.push(`## Slide ${partNumber(f)}\n${t}`);
  }
  return { ok: true, text: out.join("\n\n"), truncated: false };
}

function extractOdf(bytes: Uint8Array): ExtractResult {
  const r = readZipParts(bytes, (n) => n === "content.xml");
  if (!r.ok) return r;
  const xml = r.files["content.xml"];
  if (!xml) return { ok: false, code: "CORRUPT" };
  return { ok: true, text: odfContentToText(utf8(xml)), truncated: false };
}

function extractRtf(bytes: Uint8Array): ExtractResult {
  return { ok: true, text: rtfToText(new TextDecoder("latin1").decode(bytes)), truncated: false };
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
  else if (declaredMime === XLSX_MIME)    raw = extractXlsx(bytes);
  else if (declaredMime === PPTX_MIME)    raw = extractPptx(bytes);
  else if (declaredMime === ODT_MIME || declaredMime === ODS_MIME || declaredMime === ODP_MIME) raw = extractOdf(bytes);
  else if (declaredMime === RTF_MIME)     raw = extractRtf(bytes);
  else return { ok: false, code: "TYPE_MISMATCH" }; // images and anything else: not a text document

  if (!raw.ok) return raw;
  const cleaned = cleanExtractedText(raw.text);
  if (cleaned.length === 0) return { ok: false, code: "NO_TEXT" };
  const cut = truncateText(cleaned, ATTACHMENT_LIMITS.maxExtractedChars);
  return { ok: true, text: cut.text, truncated: cut.truncated };
}
