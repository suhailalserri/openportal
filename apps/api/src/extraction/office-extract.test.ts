import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";

import { detectMime, ODS_MIME, ODT_MIME, PPTX_MIME, RTF_MIME, XLSX_MIME } from "./file-type";
import { extractDocumentText } from "./extract";
import { makeDocx, makeOdf, makeOtherZip, makePptx, makeXlsx, utf8 } from "../test/fixtures";

/**
 * P6.3c. End-to-end through the zip glue: real zips built with fflate, real detectMime, real extractor.
 * (office-text.test.ts covers the pure XML/RTF converters on their own.)
 */
const ws = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;
const sampleXlsx = () =>
  makeXlsx(
    {
      Sales: ws(`<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>EU</t></is></c><c r="B2"><v>10</v></c></row>`),
      Notes: ws(`<row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c></row>`),
    },
    "<sst><si><t>Region</t></si><si><t>Total</t></si></sst>",
  );
const slide = (t: string) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
const ODT = `<office:document-content><office:body><office:text><text:p>Hello ODT</text:p></office:text></office:body></office:document-content>`;

describe("detectMime: the supported zip-based and RTF types, on real bytes", () => {
  it("recognises xlsx, pptx, odt/ods and rtf, and still docx", () => {
    expect(detectMime(sampleXlsx())).toBe(XLSX_MIME);
    expect(detectMime(makePptx([slide("a")]))).toBe(PPTX_MIME);
    expect(detectMime(makeOdf(ODT_MIME, ODT))).toBe(ODT_MIME);
    expect(detectMime(makeOdf(ODS_MIME, "<x/>"))).toBe(ODS_MIME);
    expect(detectMime(utf8("{\\rtf1\\ansi hi}"))).toBe(RTF_MIME);
    expect(detectMime(makeDocx(["x"]))).toContain("wordprocessingml");
  });
  it("still refuses a plain archive, a macro-enabled workbook and an OpenDocument with an unknown or missing mimetype", () => {
    expect(detectMime(makeOtherZip())).toBeNull();
    const macro = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "xl/workbook.xml": strToU8("<workbook/>"), "xl/vbaProject.bin": strToU8("x") });
    expect(detectMime(macro)).toBeNull();
    expect(detectMime(makeOdf("application/vnd.oasis.opendocument.graphics", "<x/>"))).toBeNull();
    expect(detectMime(zipSync({ "content.xml": strToU8("<x/>") }))).toBeNull();
  });
});

describe("extractDocumentText: office formats", () => {
  it("xlsx: every sheet, headed by its name, shared strings resolved", async () => {
    const r = await extractDocumentText(XLSX_MIME, sampleXlsx());
    expect(r).toEqual({ ok: true, text: "## Sales\nRegion\tTotal\nEU\t10\n\n## Notes\nhello", truncated: false });
  });
  it("pptx: one section per slide, in slide order (slide10 after slide2)", async () => {
    const slides = Array.from({ length: 10 }, (_, i) => slide(`s${i + 1}`));
    const r = await extractDocumentText(PPTX_MIME, makePptx(slides));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const heads = r.text.split("\n\n").map((b) => b.split("\n")[0]);
      expect(heads).toEqual(Array.from({ length: 10 }, (_, i) => `## Slide ${i + 1}`));
    }
  });
  it("odt and rtf", async () => {
    expect(await extractDocumentText(ODT_MIME, makeOdf(ODT_MIME, ODT))).toEqual({ ok: true, text: "Hello ODT", truncated: false });
    expect(await extractDocumentText(RTF_MIME, utf8("{\\rtf1\\ansi Hi\\par there}"))).toEqual({ ok: true, text: "Hi\nthere", truncated: false });
  });
  it("a spreadsheet with no cells is NO_TEXT, not an empty success", async () => {
    expect(await extractDocumentText(XLSX_MIME, makeXlsx({ Empty: ws("") }))).toEqual({ ok: false, code: "NO_TEXT" });
  });
  it("a declared type that the bytes do not match is TYPE_MISMATCH", async () => {
    expect(await extractDocumentText(XLSX_MIME, makeDocx(["x"]))).toEqual({ ok: false, code: "TYPE_MISMATCH" });
    expect(await extractDocumentText(PPTX_MIME, sampleXlsx())).toEqual({ ok: false, code: "TYPE_MISMATCH" });
  });
  it("an xlsx/pptx whose sheet claims to inflate past the cap is TOO_COMPLEX", async () => {
    const big = makeXlsx({ Big: ws(`<row r="1"><c r="A1"><v>${"1".repeat(31 * 1024 * 1024)}</v></c></row>`) });
    expect(await extractDocumentText(XLSX_MIME, big)).toEqual({ ok: false, code: "TOO_COMPLEX" });
  });
});
