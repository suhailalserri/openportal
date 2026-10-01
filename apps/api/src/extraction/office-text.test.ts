import { describe, it, expect } from "vitest";

import {
  columnIndex, odfContentToText, parseSharedStrings, pptxSlideToText, rtfToText, xlsxSheetNames, xlsxSheetToText,
} from "./office-text";

const sheet = (rows: string) => `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;

describe("columnIndex", () => {
  it("maps letters to zero-based columns", () => {
    expect(columnIndex("A")).toBe(0);
    expect(columnIndex("B")).toBe(1);
    expect(columnIndex("Z")).toBe(25);
    expect(columnIndex("AA")).toBe(26);
    expect(columnIndex("c")).toBe(2);
  });
});

describe("parseSharedStrings / xlsxSheetNames", () => {
  it("joins rich-text runs, decodes entities, drops phonetic hints, keeps Arabic", () => {
    const xml = `<sst><si><t>Hello</t></si><si><r><t>Rich </t></r><r><t>text</t></r></si><si><t>A &amp; B</t></si>` +
      `<si><t>مرحبا</t><rPh sb="0"><t>ignored</t></rPh></si><si/></sst>`;
    expect(parseSharedStrings(xml)).toEqual(["Hello", "Rich text", "A & B", "مرحبا", ""]);
  });
  it("lists sheet names in order", () => {
    expect(xlsxSheetNames(`<workbook><sheets><sheet name="Q1 &amp; Q2" sheetId="1"/><sheet name="Notes" sheetId="2"/></sheets></workbook>`))
      .toEqual(["Q1 & Q2", "Notes"]);
  });
});

describe("xlsxSheetToText", () => {
  const shared = ["Name", "Qty", "Widget"];
  it("reads shared strings, numbers, booleans and inline strings, tab-separated per row", () => {
    const xml = sheet(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
      `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="inlineStr"><is><t>note</t></is></c></row>`,
    );
    expect(xlsxSheetToText(xml, shared)).toBe("Name\tQty\nWidget\t42\tTRUE\tnote");
  });
  it("keeps empty cells so columns stay aligned, and drops trailing empties and empty rows", () => {
    const xml = sheet(
      `<row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c><c r="D1"/></row>` +
      `<row r="2"><c r="A2"/></row>` +
      `<row r="3"><c r="B3"><v>x</v></c></row>`,
    );
    expect(xlsxSheetToText(xml, [])).toBe("1\t\t3\n\tx");
  });
  it("flattens tabs and newlines inside a cell so a row stays one line", () => {
    const xml = sheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>a\tb\nc</t></is></c><c r="B1"><v>2</v></c></row>`);
    expect(xlsxSheetToText(xml, [])).toBe("a b c\t2");
  });
  it("decodes entities and tolerates a missing shared string", () => {
    const xml = sheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>R&amp;D</t></is></c><c r="B1" t="s"><v>99</v></c></row>`);
    expect(xlsxSheetToText(xml, [])).toBe("R&D");
  });
  it("stops reading once maxChars is reached", () => {
    const rows = Array.from({ length: 200 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${"9".repeat(20)}</v></c></row>`).join("");
    const out = xlsxSheetToText(sheet(rows), [], 100);
    expect(out.split("\n").length).toBeLessThan(10);
    expect(out.length).toBeGreaterThan(0);
  });
  it("returns an empty string for a sheet with no data", () => {
    expect(xlsxSheetToText(sheet(""), [])).toBe("");
  });
});

describe("pptxSlideToText", () => {
  it("returns one line per paragraph, joins runs, decodes entities, collapses blank runs", () => {
    const xml = `<p:sld><a:p><a:r><a:t>Title </a:t></a:r><a:r><a:t>here</a:t></a:r></a:p><a:p/><a:p></a:p><a:p></a:p>` +
      `<a:p><a:r><a:t>Q&amp;A</a:t></a:r><a:br/><a:r><a:t>مرحبا</a:t></a:r></a:p></p:sld>`;
    expect(pptxSlideToText(xml)).toBe("Title here\n\nQ&A\nمرحبا");
  });
});

describe("odfContentToText", () => {
  it("odt: paragraphs and headings become lines; spaces, tabs and line breaks are honoured", () => {
    const xml = `<office:document-content><office:automatic-styles><style:style>IGNORED</style:style></office:automatic-styles>` +
      `<office:body><office:text><text:h>Title</text:h><text:p>One<text:s text:c="2"/>two<text:tab/>three<text:line-break/>four</text:p>` +
      `<text:p>R&amp;D</text:p></office:text></office:body></office:document-content>`;
    expect(odfContentToText(xml)).toBe("Title\nOne two\tthree\nfour\nR&D");
  });
  it("ods: rows end a line and cells are tab-separated", () => {
    const xml = `<office:spreadsheet><table:table><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell>` +
      `<table:table-cell><text:p>B</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>1</text:p></table:table-cell>` +
      `<table:table-cell><text:p>2</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet>`;
    expect(odfContentToText(xml)).toBe("A\tB\n1\t2");
  });
});

describe("rtfToText", () => {
  it("plain text, paragraphs, tabs, escaped braces and backslashes", () => {
    expect(rtfToText("{\\rtf1\\ansi Hello\\par World\\tab!\\par \\{x\\} \\\\ }")).toBe("Hello\nWorld\t!\n{x} \\ ");
  });
  it("skips the font and colour tables, the info group and ignorable destinations", () => {
    const rtf = "{\\rtf1{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}{\\*\\generator Word}{\\info{\\title T}}Body\\par}";
    expect(rtfToText(rtf)).toBe("Body\n");
  });
  it("decodes \\'hh in the document's code page: windows-1252 and windows-1256 (Arabic)", () => {
    expect(rtfToText("{\\rtf1\\ansi\\ansicpg1252 caf\\'e9}")).toBe("café");
    expect(rtfToText("{\\rtf1\\ansi\\ansicpg1256 \\'e3\\'d1\\'cd\\'c8\\'c7}")).toBe("مرحبا");
  });
  it("decodes \\uN (including negative values) and skips the fallback character", () => {
    expect(rtfToText("{\\rtf1\\ansi \\u1605?\\u1585?\\u1581?\\u1576?\\u1575?}")).toBe("مرحبا");
    expect(rtfToText("{\\rtf1\\ansi \\u-4?}")).toBe(String.fromCharCode(65532));
    expect(rtfToText("{\\rtf1\\ansi\\uc2 \\u233??z}")).toBe("éz");
  });
  it("ignores raw line breaks in the source and survives garbage without throwing", () => {
    expect(rtfToText("{\\rtf1\\ansi a\r\nb}")).toBe("ab");
    expect(() => rtfToText("{{{\\\\\\'zz\\bin5 abcdef}}\\")).not.toThrow();
    expect(rtfToText("")).toBe("");
  });
});
