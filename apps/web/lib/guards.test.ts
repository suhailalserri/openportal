import { describe, it, expect } from "vitest";

import { decideAdminGuard, decideAppGuard, getSessionRole } from "./guards";

const signedIn = (role?: unknown) => ({ user: role === undefined ? { id: "u1" } : { id: "u1", role } });

describe("getSessionRole", () => {
  it("reads a string role", () => {
    expect(getSessionRole(signedIn("admin"))).toBe("admin");
  });

  it.each([[null], [undefined], [{ user: null }], [{}], [signedIn()], [signedIn(7)], [signedIn(null)]])(
    "returns null for %p",
    (session) => {
      expect(getSessionRole(session as never)).toBeNull();
    }
  );
});

describe("decideAppGuard — (app) group", () => {
  it("redirects a signed-out visitor to login and preserves the target", () => {
    expect(decideAppGuard({ locale: "ar", session: null, requestPath: "/ar/chat" })).toEqual({
      action: "redirect",
      to: "/ar/auth/login?next=%2Far%2Fchat",
    });
  });

  it("redirects to plain login when the request path is unknown", () => {
    expect(decideAppGuard({ locale: "en", session: null })).toEqual({
      action: "redirect",
      to: "/en/auth/login",
    });
    expect(decideAppGuard({ locale: "en", session: null, requestPath: null })).toEqual({
      action: "redirect",
      to: "/en/auth/login",
    });
  });

  it("drops an unsafe request path instead of forwarding it", () => {
    expect(decideAppGuard({ locale: "en", session: null, requestPath: "//evil.com" })).toEqual({
      action: "redirect",
      to: "/en/auth/login",
    });
  });

  it("treats a session object without a user as signed out", () => {
    expect(decideAppGuard({ locale: "en", session: { user: null } }).action).toBe("redirect");
    expect(decideAppGuard({ locale: "en", session: {} }).action).toBe("redirect");
  });

  it.each(["user", "admin", "superadmin"])("allows a signed-in %s", (role) => {
    expect(decideAppGuard({ locale: "en", session: signedIn(role), requestPath: "/en/chat" })).toEqual({
      action: "allow",
    });
  });

  it("allows a signed-in user whose role field is missing", () => {
    expect(decideAppGuard({ locale: "en", session: signedIn() })).toEqual({ action: "allow" });
  });
});

describe("decideAdminGuard — (admin) group", () => {
  it("sends a signed-out visitor to login with ?next=", () => {
    expect(decideAdminGuard({ locale: "en", session: null, requestPath: "/en/admin" })).toEqual({
      action: "redirect",
      to: "/en/auth/login?next=%2Fen%2Fadmin",
    });
  });

  it("sends a signed-in NON-admin to /{locale}/chat — never to login (would loop after 3.1)", () => {
    expect(decideAdminGuard({ locale: "en", session: signedIn("user"), requestPath: "/en/admin" })).toEqual({
      action: "redirect",
      to: "/en/chat",
    });
    expect(decideAdminGuard({ locale: "ar", session: signedIn("user") })).toEqual({
      action: "redirect",
      to: "/ar/chat",
    });
  });

  it.each([["admin"], ["superadmin"]])("allows %s", (role) => {
    expect(decideAdminGuard({ locale: "en", session: signedIn(role), requestPath: "/en/admin" })).toEqual({
      action: "allow",
    });
  });

  it.each([[undefined], [null], [""], ["Admin"], ["ADMIN"], ["root"], [1], [true]])(
    "fails closed for role %p (redirects to chat)",
    (role) => {
      const session = { user: { id: "u1", role } };
      expect(decideAdminGuard({ locale: "en", session })).toEqual({ action: "redirect", to: "/en/chat" });
    }
  );

  it("cannot be steered off-site through the locale param", () => {
    expect(decideAdminGuard({ locale: "//evil.com", session: signedIn("user") })).toEqual({
      action: "redirect",
      to: "/ar/chat",
    });
  });
});
