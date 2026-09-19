import { describe, it, expect } from "vitest";

import { buildLoginRedirect, resolveLocale, resolvePostLoginTarget, sanitizeNext } from "./safe-redirect";

describe("sanitizeNext — rejects", () => {
  // The five families named in the plan's Done-when for 2.1.
  it.each([
    ["protocol-relative URL", "//evil.com"],
    ["absolute https URL", "https://evil.com"],
    ["absolute http URL", "http://evil.com/ar/chat"],
    ["backslash trick", "/\\evil"],
    ["backslash after the locale", "/ar/\\evil.com"],
    ["javascript: URI", "javascript:alert(1)"],
    ["data: URI", "data:text/html,<script>alert(1)</script>"],
  ])("%s: %s", (_label, value) => {
    expect(sanitizeNext(value)).toBeNull();
  });

  it.each([
    ["empty string", ""],
    ["bare locale without a trailing slash", "/ar"],
    ["relative path", "ar/chat"],
    ["leading space", " /ar/chat"],
    ["unsupported locale", "/fr/chat"],
    ["upper-case locale", "/AR/chat"],
    ["no locale segment", "/chat"],
    ["dot-segments that escape the locale", "/ar/../evil"],
    ["encoded dot-segments that escape the locale", "/ar/%2e%2e/evil"],
    ["over-long value", `/ar/${"a".repeat(3000)}`],
  ])("%s", (_label, value) => {
    expect(sanitizeNext(value)).toBeNull();
  });

  it.each([
    ["tab (URL parser would strip it and yield //evil.com)", "/ar\t//evil.com"],
    ["tab inside a segment", "/ar/\t/evil.com"],
    ["newline", "/ar/chat\n"],
    ["carriage return", "/ar/chat\r"],
    ["NUL", "/ar/chat\u0000"],
    ["DEL", "/ar/chat\u007f"],
  ])("control characters: %s", (_label, value) => {
    expect(sanitizeNext(value)).toBeNull();
  });

  it.each([
    ["/ar/auth"],
    ["/ar/auth/login"],
    ["/en/auth/register?x=1"],
    ["/en/auth/"],
    ["/ar/%61uth/login"], // percent-encoded "a"
    ["/ar/chat/../auth/login"], // normalises to /ar/auth/login
  ])("auth targets (would loop after login): %s", (value) => {
    expect(sanitizeNext(value)).toBeNull();
  });

  it("rejects a malformed percent-escape rather than guessing", () => {
    expect(sanitizeNext("/ar/%E0%A4%A")).toBeNull();
  });

  it.each([[null], [undefined], [42], [true], [{}], [["/ar/chat"]]])("non-string input %p", (value) => {
    expect(sanitizeNext(value)).toBeNull();
  });
});

describe("sanitizeNext — accepts", () => {
  it.each([
    ["/ar/chat", "/ar/chat"],
    ["/en/chat", "/en/chat"],
    ["/en/admin", "/en/admin"],
    ["/en/admin/users/42", "/en/admin/users/42"],
    ["/ar/chat/3f2a9c1e-0000-4000-8000-000000000000", "/ar/chat/3f2a9c1e-0000-4000-8000-000000000000"],
    ["/en/billing?tab=redeem", "/en/billing?tab=redeem"],
    ["/ar/chat?q=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7", "/ar/chat?q=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7"],
  ])("valid path %s", (input, expected) => {
    expect(sanitizeNext(input)).toBe(expected);
  });

  it("a path that merely starts with 'auth' is not an auth route", () => {
    expect(sanitizeNext("/ar/authors")).toBe("/ar/authors");
  });

  it("a query value that looks like an attack is inert (it stays a query value)", () => {
    expect(sanitizeNext("/ar/chat?u=//evil.com")).toBe("/ar/chat?u=//evil.com");
  });

  it("drops the fragment (never reaches the server)", () => {
    expect(sanitizeNext("/en/billing#redeem")).toBe("/en/billing");
  });

  it("returns the normalised path when dot-segments stay inside the app", () => {
    expect(sanitizeNext("/ar/chat/../billing")).toBe("/ar/billing");
  });
});

describe("resolveLocale", () => {
  it("passes supported locales through and falls back to ar", () => {
    expect(resolveLocale("ar")).toBe("ar");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("fr")).toBe("ar");
    expect(resolveLocale("")).toBe("ar");
    expect(resolveLocale(undefined)).toBe("ar");
    expect(resolveLocale("//evil.com")).toBe("ar");
  });
});

describe("buildLoginRedirect", () => {
  it("adds an encoded ?next= for a safe path", () => {
    expect(buildLoginRedirect("ar", "/ar/chat")).toBe("/ar/auth/login?next=%2Far%2Fchat");
    expect(buildLoginRedirect("en", "/en/admin/users?page=2")).toBe(
      "/en/auth/login?next=%2Fen%2Fadmin%2Fusers%3Fpage%3D2"
    );
  });

  it("omits ?next= when there is no path (header missing)", () => {
    expect(buildLoginRedirect("en")).toBe("/en/auth/login");
    expect(buildLoginRedirect("en", null)).toBe("/en/auth/login");
    expect(buildLoginRedirect("en", "")).toBe("/en/auth/login");
  });

  it("omits ?next= when the path fails sanitizeNext (spoofed header)", () => {
    expect(buildLoginRedirect("en", "//evil.com")).toBe("/en/auth/login");
    expect(buildLoginRedirect("en", "https://evil.com")).toBe("/en/auth/login");
    expect(buildLoginRedirect("en", "/en/auth/login")).toBe("/en/auth/login");
  });

  it("never lets an unsupported locale param shape the redirect target", () => {
    expect(buildLoginRedirect("//evil.com", "/ar/chat")).toBe("/ar/auth/login?next=%2Far%2Fchat");
    expect(buildLoginRedirect("fr")).toBe("/ar/auth/login");
  });

  it("round-trips: the produced ?next= value survives sanitizeNext unchanged", () => {
    const path = "/en/admin/users?page=2&q=a b";
    const login = buildLoginRedirect("en", path);
    const next = new URL(login, "http://localhost").searchParams.get("next");
    expect(sanitizeNext(next)).toBe("/en/admin/users?page=2&q=a%20b");
  });
});

describe("resolvePostLoginTarget", () => {
  it("returns the sanitized next when valid", () => {
    expect(resolvePostLoginTarget("/en/admin/users", "en")).toBe("/en/admin/users");
  });

  it("falls back to /{locale}/chat for anything unsafe or missing", () => {
    expect(resolvePostLoginTarget("//evil.com", "en")).toBe("/en/chat");
    expect(resolvePostLoginTarget("https://evil.com", "ar")).toBe("/ar/chat");
    expect(resolvePostLoginTarget("/en/auth/login", "en")).toBe("/en/chat");
    expect(resolvePostLoginTarget(null, "ar")).toBe("/ar/chat");
    expect(resolvePostLoginTarget(undefined, "en")).toBe("/en/chat");
  });
});
