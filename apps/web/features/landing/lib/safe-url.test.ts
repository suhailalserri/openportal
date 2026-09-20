import { describe, it, expect } from "vitest";

import { safeLogoUrl } from "./safe-url";

describe("safeLogoUrl — accepts", () => {
  it("absolute https URLs", () => {
    expect(safeLogoUrl("https://cdn.example.com/jaib.png")).toBe("https://cdn.example.com/jaib.png");
  });
  it("absolute http URLs (some admins paste these)", () => {
    expect(safeLogoUrl("http://example.com/x.svg")).toBe("http://example.com/x.svg");
  });
  it("a same-origin path", () => {
    expect(safeLogoUrl("/logos/jaib.svg")).toBe("/logos/jaib.svg");
  });
  it("trims surrounding whitespace", () => {
    expect(safeLogoUrl("  https://example.com/a.png  ")).toBe("https://example.com/a.png");
  });
  it("keeps a query string", () => {
    expect(safeLogoUrl("https://example.com/a.png?v=2")).toBe("https://example.com/a.png?v=2");
  });
});

describe("safeLogoUrl — rejects scripting and non-web schemes", () => {
  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com/a.png",
    "blob:https://example.com/abc",
    "about:blank",
    "mailto:a@b.co",
    "tel:+967700000000",
  ])("%s", (bad) => {
    expect(safeLogoUrl(bad)).toBeNull();
  });
});

describe("safeLogoUrl — rejects browser-parsing bypasses", () => {
  it("whitespace/control characters smuggled inside the scheme", () => {
    expect(safeLogoUrl("java\tscript:alert(1)")).toBeNull();
    expect(safeLogoUrl("java\nscript:alert(1)")).toBeNull();
    expect(safeLogoUrl("java\rscript:alert(1)")).toBeNull();
    expect(safeLogoUrl("java\u0000script:alert(1)")).toBeNull();
    expect(safeLogoUrl("\u0001javascript:alert(1)")).toBeNull();
  });
  it("a leading-space scheme", () => {
    expect(safeLogoUrl(" javascript:alert(1)")).toBeNull();
  });
  it("embedded spaces anywhere", () => {
    expect(safeLogoUrl("https://exa mple.com/a.png")).toBeNull();
    expect(safeLogoUrl("/logos/a b.png")).toBeNull();
  });
  it("protocol-relative URLs (would point at any host)", () => {
    expect(safeLogoUrl("//evil.com/a.png")).toBeNull();
    expect(safeLogoUrl("///evil.com/a.png")).toBeNull();
  });
  it("backslash tricks that browsers normalise to slashes", () => {
    expect(safeLogoUrl("/\\evil.com/a.png")).toBeNull();
    expect(safeLogoUrl("\\\\evil.com\\a.png")).toBeNull();
    expect(safeLogoUrl("https:\\\\evil.com\\a.png")).toBeNull();
  });
  it("a host-less http(s) URL", () => {
    expect(safeLogoUrl("https:///a.png")).toBeNull();
    expect(safeLogoUrl("https:")).toBeNull();
  });
  it("extra slashes after the scheme, which the URL parser would silently reinterpret as a hostname (regression)", () => {
    // Without the raw-text check these parse to host "cdn.example.com" / "a.png".
    expect(safeLogoUrl("https:///cdn.example.com/x.png")).toBeNull();
    expect(safeLogoUrl("http:////cdn.example.com/x.png")).toBeNull();
    expect(safeLogoUrl("https:////a.png")).toBeNull();
  });
  it("a scheme with no slashes at all", () => {
    expect(safeLogoUrl("https:cdn.example.com/x.png")).toBeNull();
    expect(safeLogoUrl("http:example.com")).toBeNull();
  });
});

describe("safeLogoUrl — rejects garbage", () => {
  it("null, undefined, non-strings", () => {
    expect(safeLogoUrl(null)).toBeNull();
    expect(safeLogoUrl(undefined)).toBeNull();
    expect(safeLogoUrl(42 as unknown as string)).toBeNull();
    expect(safeLogoUrl({} as unknown as string)).toBeNull();
  });
  it("empty and whitespace-only", () => {
    expect(safeLogoUrl("")).toBeNull();
    expect(safeLogoUrl("   ")).toBeNull();
  });
  it("a bare word or relative path (not a URL, not rooted)", () => {
    expect(safeLogoUrl("jaib.png")).toBeNull();
    expect(safeLogoUrl("logos/jaib.png")).toBeNull();
    expect(safeLogoUrl("not a url")).toBeNull();
  });
  it("over-long values", () => {
    expect(safeLogoUrl("https://example.com/" + "a".repeat(3000))).toBeNull();
  });
});
