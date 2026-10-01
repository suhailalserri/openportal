import { describe, it, expect } from "vitest";

import {
  ATTACH_LIMITS, attachErrorKey, classifyFile, fileExtension, fileFamily, formatBytes, rejectKey, XLSX_MIME,
  type AttachRejectReason,
} from "./attach-types";

const f = (name: string, type = "", size = 1000) => ({ name, type, size });

describe("fileExtension", () => {
  it("takes the last extension, lowercased, and treats a leading dot as part of the name", () => {
    expect(fileExtension("Report.FINAL.PDF")).toBe("pdf");
    expect(fileExtension("archive.tar.gz")).toBe("gz");
    expect(fileExtension(".gitignore")).toBe("gitignore");
    expect(fileExtension("Dockerfile")).toBe("");
    expect(fileExtension("C:\\x\\y\\file.TXT")).toBe("txt");
    expect(fileExtension("noext.")).toBe("");
  });
});

describe("classifyFile: the text family is sent as text/plain whatever the browser says", () => {
  it("accepts code, data, markup and config files with empty or odd browser MIME types", () => {
    const names = ["main.py", "App.tsx", "notes.md", "data.csv", "config.yaml", "query.sql", "main.go", "lib.rs", "Program.cs",
      "script.sh", "index.html", "styles.scss", "build.gradle", "data.jsonl", "deploy.tf", "page.vue", "x.ipynb", "a.log", "b.srt"];
    for (const name of names) {
      for (const type of ["", "application/octet-stream", "text/x-python", "application/json"]) {
        const r = classifyFile(f(name, type));
        expect(r).toEqual({ ok: true, mimeType: "text/plain", kind: "document" });
      }
    }
  });
  it("accepts well-known extensionless names, dotfiles, and an unknown extension the browser calls text", () => {
    for (const n of ["Dockerfile", "Makefile", "README", "LICENSE", ".gitignore", ".editorconfig"]) {
      expect(classifyFile(f(n)).ok).toBe(true);
    }
    expect(classifyFile(f("weird.xyz", "text/plain"))).toEqual({ ok: true, mimeType: "text/plain", kind: "document" });
    expect(classifyFile(f("noext", "text/plain"))).toEqual({ ok: true, mimeType: "text/plain", kind: "document" });
  });
});

describe("classifyFile: documents and images", () => {
  it("maps office formats to their real MIME type, by extension", () => {
    expect(classifyFile(f("a.pdf"))).toEqual({ ok: true, mimeType: "application/pdf", kind: "document" });
    expect(classifyFile(f("a.xlsx"))).toEqual({ ok: true, mimeType: XLSX_MIME, kind: "document" });
    expect(classifyFile(f("a.docx", "application/octet-stream"))).toMatchObject({ ok: true, kind: "document" });
    for (const e of ["pptx", "odt", "ods", "odp", "rtf"]) expect(classifyFile(f(`a.${e}`)).ok).toBe(true);
  });
  it("accepts png/jpeg/webp/gif as images, using the browser type or the extension", () => {
    expect(classifyFile(f("a.png", "image/png"))).toEqual({ ok: true, mimeType: "image/png", kind: "image" });
    expect(classifyFile(f("a.JPG", ""))).toEqual({ ok: true, mimeType: "image/jpeg", kind: "image" });
    expect(classifyFile(f("noext", "image/webp"))).toEqual({ ok: true, mimeType: "image/webp", kind: "image" });
    expect(classifyFile(f("a.gif")).ok).toBe(true);
  });
});

describe("classifyFile: refusals, each with its own reason", () => {
  const cases: [string, string, AttachRejectReason][] = [
    ["x.zip", "application/zip", "ARCHIVE"], ["x.7z", "", "ARCHIVE"], ["x.tar", "", "ARCHIVE"], ["x.jar", "", "ARCHIVE"],
    ["x.doc", "application/msword", "LEGACY_OFFICE"], ["x.xls", "", "LEGACY_OFFICE"], ["x.ppt", "", "LEGACY_OFFICE"],
    ["x.xlsm", "", "MACRO_OFFICE"], ["x.docm", "", "MACRO_OFFICE"],
    ["x.mp3", "audio/mpeg", "MEDIA"], ["x.mp4", "video/mp4", "MEDIA"], ["voice", "audio/webm", "MEDIA"],
    ["x.heic", "image/heic", "IMAGE_FORMAT"], ["x.bmp", "image/bmp", "IMAGE_FORMAT"], ["x.avif", "", "IMAGE_FORMAT"], ["x", "image/tiff", "IMAGE_FORMAT"],
    ["x.svg", "image/svg+xml", "UNSUPPORTED"], ["x.exe", "application/x-msdownload", "UNSUPPORTED"], ["x.bin", "", "UNSUPPORTED"], ["x.dll", "", "UNSUPPORTED"],
  ];
  for (const [name, type, reason] of cases) {
    it(`${name} (${type || "no type"}) -> ${reason}`, () => {
      expect(classifyFile(f(name, type))).toEqual({ ok: false, reason });
    });
  }
  it("a refused extension is never rescued by a friendly MIME type", () => {
    expect(classifyFile(f("evil.exe", "text/plain"))).toEqual({ ok: false, reason: "UNSUPPORTED" });
    expect(classifyFile(f("x.zip", "text/plain"))).toEqual({ ok: false, reason: "ARCHIVE" });
    expect(classifyFile(f("x.svg", "text/plain"))).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });
  it("an empty file is refused", () => {
    expect(classifyFile(f("a.txt", "text/plain", 0))).toEqual({ ok: false, reason: "EMPTY" });
  });
});

describe("classifyFile: size limits", () => {
  it("images are capped at 5 MiB, everything else at 20 MiB, and the limit itself is allowed", () => {
    expect(classifyFile(f("a.png", "image/png", ATTACH_LIMITS.maxImageBytes)).ok).toBe(true);
    expect(classifyFile(f("a.png", "image/png", ATTACH_LIMITS.maxImageBytes + 1))).toEqual({ ok: false, reason: "IMAGE_TOO_LARGE" });
    expect(classifyFile(f("a.pdf", "", ATTACH_LIMITS.maxBytes)).ok).toBe(true);
    expect(classifyFile(f("a.pdf", "", ATTACH_LIMITS.maxBytes + 1))).toEqual({ ok: false, reason: "TOO_LARGE" });
    expect(classifyFile(f("a.py", "", ATTACH_LIMITS.maxBytes + 1))).toEqual({ ok: false, reason: "TOO_LARGE" });
  });
});

describe("messages and display helpers", () => {
  it("every refusal reason has its own message key", () => {
    const reasons: AttachRejectReason[] = ["EMPTY", "TOO_LARGE", "IMAGE_TOO_LARGE", "IMAGE_FORMAT", "LEGACY_OFFICE", "MACRO_OFFICE", "ARCHIVE", "MEDIA", "UNSUPPORTED"];
    expect(new Set(reasons.map(rejectKey)).size).toBe(reasons.length);
  });
  it("maps the server and extraction codes to specific messages and falls back to generic", () => {
    const specific = ["INVALID_MIME", "FILE_TOO_LARGE", "QUOTA_DAILY", "QUOTA_BYTES", "CONVERSATION_NOT_FOUND", "TYPE_MISMATCH", "CORRUPT",
      "NO_TEXT", "TEXT_ENCODING", "TOO_COMPLEX", "TIMEOUT", "MEMORY", "STALLED", "EXTRACT_FAILED", "NETWORK", "UPLOAD_FAILED", "STORAGE_DISABLED", "QUEUE_UNAVAILABLE"];
    for (const c of specific) expect(attachErrorKey(c)).not.toBe("attachErrGeneric");
    expect(attachErrorKey("NOPE")).toBe("attachErrGeneric");
    expect(attachErrorKey("NO_TEXT")).toBe("attachErrNoText");
    expect(attachErrorKey("QUOTA_DAILY")).toBe("attachErrQuota");
  });
  it("formats sizes and picks an icon family", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(20 * 1024)).toBe("20 KB");
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
    expect(formatBytes(-1)).toBe("0 B");
    expect(fileFamily("a.pdf", "document")).toBe("pdf");
    expect(fileFamily("a.xlsx", "document")).toBe("sheet");
    expect(fileFamily("a.csv", "document")).toBe("sheet");
    expect(fileFamily("a.pptx", "document")).toBe("slides");
    expect(fileFamily("a.docx", "document")).toBe("word");
    expect(fileFamily("a.py", "document")).toBe("code");
    expect(fileFamily("a.md", "document")).toBe("text");
    expect(fileFamily("a.png", "image")).toBe("image");
  });
});
