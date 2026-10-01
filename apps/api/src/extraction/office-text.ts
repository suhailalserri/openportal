/**
 * P6.3c: pure text extraction for the Office-family formats (xlsx, pptx, OpenDocument, RTF).
 * Strings in, string out: no zip, no I/O, no dependency, so every function here is unit-tested
 * anywhere. The zip handling (entry filters, inflate caps) lives in extract.ts, next to the DOCX
 * code it mirrors. Output is UNTRUSTED document text, cleaned and framed later (5.2b).
 *
 * All regexes are linear: lazy `[\\s\\S]*?` bounded by a literal closing tag, no nested quantifiers.
 */

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : "";
    }
    return XML_ENTITIES[e] ?? m;
  });
}

// ── xlsx ────────────────────────────────────────────────────────────────────

/** xl/sharedStrings.xml -> the string table (rich-text runs joined, phonetic hints dropped). */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  // `<si/>` (an empty string entry) counts: skipping it would shift every later index.
  const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = (m[1] ?? "").replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    const parts: string[] = [];
    const t = /<t\b[^>]*>([^<]*)<\/t>/g;
    let x: RegExpExecArray | null;
    while ((x = t.exec(body)) !== null) parts.push(decodeXmlEntities(x[1] ?? ""));
    out.push(parts.join(""));
  }
  return out;
}

/** xl/workbook.xml -> sheet names in workbook order. */
export function xlsxSheetNames(xml: string): string[] {
  const names: string[] = [];
  const re = /<sheet\b[^>]*\bname="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) names.push(decodeXmlEntities(m[1] ?? ""));
  return names;
}

/** "A" -> 0, "B" -> 1, "AA" -> 26. */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * One worksheet -> tab-separated rows. Empty cells keep their column (so columns stay aligned),
 * trailing empties and fully empty rows are dropped. Stops once `maxChars` is reached.
 */
export function xlsxSheetToText(xml: string, shared: string[], maxChars = Infinity): string {
  const rows: string[] = [];
  let total = 0;
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml)) !== null) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let next = 0;
    while ((cm = cellRe.exec(rm[1] ?? "")) !== null) {
      const attrs = cm[1] ?? "";
      const inner = cm[2] ?? "";
      const ref = /\br="([A-Za-z]+)\d+"/.exec(attrs);
      const col = ref ? columnIndex(ref[1] ?? "A") : next;
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "inlineStr") {
        value = [...inner.matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((x) => decodeXmlEntities(x[1] ?? "")).join("");
      } else {
        const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) {
          if (type === "s") value = shared[Number(v)] ?? "";
          else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
          else value = decodeXmlEntities(v);
        }
      }
      while (cells.length < col) cells.push("");
      cells[col] = value.replace(/[\t\r\n]+/g, " ");
      next = col + 1;
    }
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    if (cells.length === 0) continue;
    const line = cells.join("\t");
    rows.push(line);
    total += line.length + 1;
    if (total >= maxChars) break;
  }
  return rows.join("\n");
}

// ── pptx ────────────────────────────────────────────────────────────────────

/** ppt/slides/slideN.xml -> text: runs (<a:t>), one line per paragraph. */
export function pptxSlideToText(xml: string): string {
  const out: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>|<a:br\b[^>]*\/>|<\/a:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) out.push(decodeXmlEntities(m[1]));
    else out.push("\n");
  }
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

// ── OpenDocument (odt / ods / odp) ──────────────────────────────────────────

/** content.xml -> text. Paragraphs/headings end a line, table rows end a line, cells are tab-separated. */
export function odfContentToText(xml: string): string {
  const body = xml.replace(/<office:(?:automatic-styles|font-face-decls|scripts)\b[\s\S]*?<\/office:(?:automatic-styles|font-face-decls|scripts)>/g, "");
  return decodeXmlEntities(
    body
      // A paragraph that closes a cell is the cell's text, not a line break.
      .replace(/<\/text:p>\s*<\/table:table-cell>/g, "</table:table-cell>")
      .replace(/<\/text:(?:p|h)>|<\/table:table-row>|<text:line-break\s*\/>/g, "\n")
      .replace(/<\/table:table-cell>|<text:tab\s*\/>/g, "\t")
      .replace(/<text:s\b[^>]*\/>/g, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── RTF ─────────────────────────────────────────────────────────────────────

/** Destination groups whose content is not body text. */
const RTF_SKIP = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr", "footerl", "footerr",
  "footnote", "object", "themedata", "colorschememapping", "datastore", "latentstyles", "listtable", "listoverridetable",
  "rsidtbl", "generator", "xmlnstbl", "fldinst", "bkmkstart", "bkmkend", "shpinst", "nonshppict",
]);

/** `lib` is ES2022 without DOM here, so `TextDecoder` is a value only: derive the instance type from it. */
type Decoder = InstanceType<typeof TextDecoder>;

/** RTF source (read as latin1, one char per byte) -> text. Handles \'hh in the document's code page and \uN. */
export function rtfToText(src: string): string {
  const out: string[] = [];
  const stack: boolean[] = [];
  let skip = false;
  let codepage = 1252;
  let ucSkip = 1;
  let pendingSkip = 0;
  const decoders = new Map<number, Decoder>();
  const decodeByte = (b: number): string => {
    let d = decoders.get(codepage);
    if (!d) {
      try { d = new TextDecoder(`windows-${codepage}`); } catch { d = new TextDecoder("windows-1252"); }
      decoders.set(codepage, d);
    }
    return d.decode(Uint8Array.of(b));
  };
  const emit = (s: string): void => { if (!skip) out.push(s); };

  for (let i = 0; i < src.length; ) {
    const ch = src[i]!;
    if (ch === "{") {
      stack.push(skip);
      i++;
      if (src.startsWith("\\*", i)) { skip = true; i += 2; } // ignorable destination
      continue;
    }
    if (ch === "}") { skip = stack.pop() ?? false; i++; continue; }
    if (ch === "\r" || ch === "\n") { i++; continue; }
    if (ch !== "\\") {
      if (pendingSkip > 0) pendingSkip--; else emit(ch);
      i++;
      continue;
    }
    // control sequence
    i++;
    const c = src[i] ?? "";
    if (c === "\\" || c === "{" || c === "}") { if (pendingSkip > 0) pendingSkip--; else emit(c); i++; continue; }
    if (c === "'") {
      const hex = src.slice(i + 1, i + 3);
      i += 3;
      if (pendingSkip > 0) { pendingSkip--; continue; }
      const b = parseInt(hex, 16);
      if (Number.isFinite(b)) emit(decodeByte(b));
      continue;
    }
    if (c === "~") { emit(" "); i++; continue; }
    if (c === "-" || c === "_") { i++; continue; }
    if (c === "*") { skip = true; i++; continue; }
    const wm = /^([a-zA-Z]+)(-?\d+)?[ ]?/.exec(src.slice(i, i + 40));
    if (!wm) { i++; continue; }
    i += wm[0].length;
    const word = wm[1]!;
    const param = wm[2] !== undefined ? parseInt(wm[2], 10) : undefined;
    if (RTF_SKIP.has(word)) { skip = true; continue; }
    switch (word) {
      case "par": case "line": case "sect": case "page": emit("\n"); break;
      case "tab": emit("\t"); break;
      case "emdash": emit("\u2014"); break;
      case "endash": emit("\u2013"); break;
      case "bullet": emit("\u2022"); break;
      case "ansicpg": if (param !== undefined && param > 0) codepage = param; break;
      case "uc": if (param !== undefined && param >= 0) ucSkip = param; break;
      case "u":
        if (param !== undefined) {
          emit(String.fromCharCode(param < 0 ? param + 65536 : param));
          pendingSkip = ucSkip;
        }
        break;
      case "bin": if (param !== undefined && param > 0) i += param; break;
      default: break;
    }
  }
  return out.join("");
}
