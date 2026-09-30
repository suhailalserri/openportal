import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_LIMITS, cleanExtractedText, kindFromMime, sanitizeFileName, truncateText,
} from "./attachments.policy";

describe("sanitizeFileName", () => {
  it("keeps a normal name", () => {
    expect(sanitizeFileName("Quarterly report (final).pdf")).toBe("Quarterly report (final).pdf");
    expect(sanitizeFileName("تقرير.docx")).toBe("تقرير.docx");
  });
  it("drops path parts, controls, bidi overrides and delimiter-breaking characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\a.txt")).toBe("a.txt");
    expect(sanitizeFileName("a\nb\u0000c\u202ed.txt")).toBe("abcd.txt");
    expect(sanitizeFileName('x"><b>.txt')).not.toMatch(/[<>"]/);
    expect(sanitizeFileName(".hidden")).toBe("hidden");
  });
  it("falls back to 'file' and caps the length, keeping a short extension", () => {
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("///")).toBe("file");
    const long = sanitizeFileName("a".repeat(400) + ".pdf");
    expect(long.length).toBe(ATTACHMENT_LIMITS.maxFileNameLength);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("kindFromMime", () => {
  it("maps the allowlist", () => {
    expect(kindFromMime("image/png")).toBe("image");
    expect(kindFromMime("application/pdf")).toBe("document");
    expect(kindFromMime("text/plain")).toBe("document");
    expect(kindFromMime("audio/webm")).toBe("audio");
  });
});

describe("text helpers", () => {
  it("cleanExtractedText removes NUL/controls, normalizes newlines, collapses blank runs", () => {
    expect(cleanExtractedText("a\u0000b\r\nc\r\r\n\n\n\n\n\nd  \n")).toBe("ab\nc\n\n\nd");
  });
  it("truncateText cuts at the cap and never ends on half a surrogate pair", () => {
    expect(truncateText("hello", 10)).toEqual({ text: "hello", truncated: false });
    expect(truncateText("hello world", 5)).toEqual({ text: "hello", truncated: true });
    const s = "ab😀cd"; // 😀 is two UTF-16 units at index 2..3
    const cut = truncateText(s, 3);
    expect(cut.truncated).toBe(true);
    expect(cut.text).toBe("ab");
  });
});
