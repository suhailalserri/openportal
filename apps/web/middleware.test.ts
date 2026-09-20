import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";
import { REQUEST_PATH_HEADER } from "./lib/request-path";

const req = (path: string, headers?: Record<string, string>) =>
  new NextRequest(new URL(path, "http://localhost:3000"), headers ? { headers } : undefined);

describe("middleware — Phase 2.1 x-pathname forwarding", () => {
  it("uses the same header name the server helper reads", () => {
    // Guard against the two string literals drifting apart.
    expect(REQUEST_PATH_HEADER).toBe("x-pathname");
  });

  it("forwards path + query on a localized page request", () => {
    const res = middleware(req("/ar/chat?tab=1"));
    expect(res.headers.get(REQUEST_PATH_HEADER)).toBe("/ar/chat?tab=1");
  });

  it("forwards a path without a query as just the path", () => {
    const res = middleware(req("/en/admin"));
    expect(res.headers.get(REQUEST_PATH_HEADER)).toBe("/en/admin");
  });

  it("still sets the next-intl locale header exactly as before (the frozen behaviour we must not break)", () => {
    expect(middleware(req("/ar/chat")).headers.get("x-next-intl-locale")).toBe("ar");
    expect(middleware(req("/en/admin/users")).headers.get("x-next-intl-locale")).toBe("en");
  });

  it("emits the real path even when the client sent its own x-pathname", () => {
    const res = middleware(req("/en/chat", { [REQUEST_PATH_HEADER]: "//evil.com" }));
    expect(res.headers.get(REQUEST_PATH_HEADER)).toBe("/en/chat");
  });

  it("bare / still redirects to /{locale}/chat (unchanged) and forwards nothing", () => {
    const res = middleware(req("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/ar/chat");
    expect(res.headers.get(REQUEST_PATH_HEADER)).toBeNull();
  });

  it("honours Accept-Language for the bare-/ redirect (unchanged)", () => {
    const res = middleware(req("/", { "accept-language": "en-US,en;q=0.9" }));
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/en/chat");
  });

  it("does not touch /api paths", () => {
    const res = middleware(req("/api/health"));
    expect(res.headers.get(REQUEST_PATH_HEADER)).toBeNull();
    expect(res.headers.get("x-next-intl-locale")).toBeNull();
  });
});
