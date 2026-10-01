/** P5.2a: fixtures built at test time (no binary files in the repo). */
import { zipSync, strToU8 } from "fflate";

const enc = new TextEncoder();

/** A valid one-page PDF with correct xref offsets. `text === null` -> page with no text at all. */
export function makePdf(text: string | null): Uint8Array {
  const content = text === null ? "" : `BT /F1 18 Tf 20 100 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export function docxXml(paragraphs: string[]): string {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
}

export function makeDocx(paragraphs: string[], extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "word/document.xml": strToU8(docxXml(paragraphs)),
    ...extra,
  });
}

/** A valid ZIP that is not any supported document (a jar-like archive). P6.3c: it used to be xlsx-shaped, but xlsx is supported now. */
export function makeOtherZip(): Uint8Array {
  return zipSync({ "META-INF/MANIFEST.MF": strToU8("Manifest-Version: 1.0\n"), "Main.class": strToU8("not really") });
}

const CT = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';

export function makeXlsx(sheets: Record<string, string>, sharedStrings = ""): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(CT),
    "xl/workbook.xml": strToU8(`<workbook><sheets>${Object.keys(sheets).map((n, i) => `<sheet name="${n}" sheetId="${i + 1}"/>`).join("")}</sheets></workbook>`),
  };
  Object.values(sheets).forEach((xml, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml); });
  if (sharedStrings) files["xl/sharedStrings.xml"] = strToU8(sharedStrings);
  return zipSync(files);
}

export function makePptx(slides: string[]): Uint8Array {
  const files: Record<string, Uint8Array> = { "[Content_Types].xml": strToU8(CT), "ppt/presentation.xml": strToU8("<p:presentation/>") };
  slides.forEach((xml, i) => { files[`ppt/slides/slide${i + 1}.xml`] = strToU8(xml); });
  return zipSync(files);
}

export function makeOdf(mimetype: string, contentXml: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({ mimetype: strToU8(mimetype), "content.xml": strToU8(contentXml), ...extra });
}

export const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
export const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
export const EXE_BYTES = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
export const utf8 = (s: string) => enc.encode(s);
