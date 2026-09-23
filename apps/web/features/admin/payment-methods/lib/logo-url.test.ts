import { describe, expect, it } from "vitest";

import { LOGO_URL_MAX_LENGTH, parseLogoUrl } from "./logo-url";

describe("parseLogoUrl", () => {
  it("treats blank and whitespace-only as 'no logo' (key omitted, not an empty string)", () => {
    expect(parseLogoUrl("")).toEqual({ ok: true, value: undefined });
    expect(parseLogoUrl("   ")).toEqual({ ok: true, value: undefined });
  });

  it("accepts http(s) URLs and trims them", () => {
    expect(parseLogoUrl(" https://cdn.example.com/a.png ")).toEqual({ ok: true, value: "https://cdn.example.com/a.png" });
    expect(parseLogoUrl("http://example.com/a.png")).toEqual({ ok: true, value: "http://example.com/a.png" });
  });

  it("rejects non-URLs and non-http(s) schemes", () => {
    expect(parseLogoUrl("not a url")).toEqual({ ok: false });
    expect(parseLogoUrl("javascript:alert(1)")).toEqual({ ok: false });
    expect(parseLogoUrl("data:image/png;base64,AAAA")).toEqual({ ok: false });
    expect(parseLogoUrl("/logos/jaib.png")).toEqual({ ok: false });
  });

  it("rejects URLs longer than the server's 2048 limit", () => {
    const long = `https://example.com/${"a".repeat(LOGO_URL_MAX_LENGTH)}`;
    expect(parseLogoUrl(long)).toEqual({ ok: false });
  });
});
