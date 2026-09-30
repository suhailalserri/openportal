import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { detectMime, DOCX_MIME } from "./file-type";
import { extractDocumentText, docxXmlToText } from "./extract";
import { ATTACHMENT_LIMITS } from "../services/attachments.policy";
import { makePdf, makeDocx, makeOtherZip, PNG_BYTES, JPEG_BYTES, EXE_BYTES, utf8 } from "../test/fixtures";

describe("detectMime (real bytes, not the claimed type)", () => {
  it("recognizes every allowlisted type", () => {
    expect(detectMime(PNG_BYTES)).toBe("image/png");
    expect(detectMime(JPEG_BYTES)).toBe("image/jpeg");
    expect(detectMime(utf8("GIF89a....."))).toBe("image/gif");
    expect(detectMime(utf8("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp");
    expect(detectMime(makePdf("hi"))).toBe("application/pdf");
    expect(detectMime(makeDocx(["hi"]))).toBe(DOCX_MIME);
    expect(detectMime(utf8("just some text\nwith lines"))).toBe("text/plain");
  });
  it("rejects executables, other zips, binary junk and empty input", () => {
    expect(detectMime(EXE_BYTES)).toBeNull();
    expect(detectMime(makeOtherZip())).toBeNull();
    expect(detectMime(Uint8Array.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(detectMime(new Uint8Array(0))).toBeNull();
    expect(detectMime(utf8("text with a NUL \u0000 inside"))).toBeNull();
  });
});

describe("extractDocumentText", () => {
  it("extracts text from a fixture PDF", async () => {
    const r = await extractDocumentText("application/pdf", makePdf("Hello OpenPortal PDF"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("Hello OpenPortal PDF");
  });

  it("extracts text from a fixture DOCX (paragraphs, entities, tabs, breaks)", async () => {
    const xml = `<w:document xmlns:w="x"><w:body>
      <w:p><w:r><w:t>First &amp; foremost</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>tabbed</w:t></w:r></w:p>
      <w:p><w:r><w:t>line</w:t><w:br/><w:t>two &#x41;&#66;</w:t></w:r></w:p></w:body></w:document>`;
    const docx = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8(xml) });
    const r = await extractDocumentText(DOCX_MIME, docx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("First & foremost\ttabbed\nline\ntwo AB");
  });

  it("reads plain UTF-8 text (incl. BOM and Arabic) and rejects other encodings", async () => {
    const ok = await extractDocumentText("text/plain", utf8("\ufeffمرحبا بالعالم\nline 2"));
    expect(ok).toEqual({ ok: true, text: "مرحبا بالعالم\nline 2", truncated: false });
    // Windows-1256 'مرحبا' is not valid UTF-8, and is also not detected as text at all.
    const bad = await extractDocumentText("text/plain", Uint8Array.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]));
    expect(bad).toEqual({ ok: false, code: "TYPE_MISMATCH" });
  });

  it("TYPE_MISMATCH when the bytes are not what was declared", async () => {
    expect(await extractDocumentText("application/pdf", makeDocx(["x"]))).toEqual({ ok: false, code: "TYPE_MISMATCH" });
    expect(await extractDocumentText(DOCX_MIME, makePdf("x"))).toEqual({ ok: false, code: "TYPE_MISMATCH" });
    expect(await extractDocumentText("text/plain", EXE_BYTES)).toEqual({ ok: false, code: "TYPE_MISMATCH" });
    expect(await extractDocumentText("application/pdf", makeOtherZip())).toEqual({ ok: false, code: "TYPE_MISMATCH" });
    // images are never text documents
    expect(await extractDocumentText("image/png", PNG_BYTES)).toEqual({ ok: false, code: "TYPE_MISMATCH" });
  });

  it("CORRUPT for a PDF header with garbage behind it", async () => {
    const r = await extractDocumentText("application/pdf", utf8("%PDF-1.4\nthis is not a pdf body at all"));
    expect(r).toEqual({ ok: false, code: "CORRUPT" });
  });

  it("NO_TEXT for a PDF with no text (scanned pages) and for a whitespace-only txt", async () => {
    expect(await extractDocumentText("application/pdf", makePdf(null))).toEqual({ ok: false, code: "NO_TEXT" });
    expect(await extractDocumentText("text/plain", utf8("   \n\t \n"))).toEqual({ ok: false, code: "NO_TEXT" });
  });

  it("TOO_COMPLEX for a DOCX whose document.xml inflates past the cap (zip bomb)", async () => {
    const big = new Uint8Array(ATTACHMENT_LIMITS.maxDocxXmlBytes + 1024 * 1024); // zeros: tiny once zipped
    const bomb = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": big });
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(await extractDocumentText(DOCX_MIME, bomb)).toEqual({ ok: false, code: "TOO_COMPLEX" });
  });

  it("truncates to the hard cap and says so", async () => {
    const r = await extractDocumentText("text/plain", utf8("a".repeat(ATTACHMENT_LIMITS.maxExtractedChars + 500)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text.length).toBe(ATTACHMENT_LIMITS.maxExtractedChars);
      expect(r.truncated).toBe(true);
    }
  });

  it("strips control characters from extracted text", async () => {
    const r = await extractDocumentText("text/plain", utf8("a\u0001b\u0007c\td"));
    expect(r).toEqual({ ok: true, text: "abc\td", truncated: false });
  });
});

describe("docxXmlToText", () => {
  it("ignores unknown tags and decodes numeric entities safely", () => {
    expect(docxXmlToText('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>x&#0;y&#xD800;z</w:t></w:r></w:p>')).toBe("xyz\n");
  });
});
