import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { NAV_GROUPS, getNavGroups, isNavItemActive } from "./nav";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

function loadNavMessages(locale: "ar" | "en"): Record<string, unknown> {
  const raw = readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf-8");
  return (JSON.parse(raw) as { nav: Record<string, unknown> }).nav;
}

const groupIds = (role: unknown) => getNavGroups(role).map((g) => g.id);
const itemIds = (role: unknown) => getNavGroups(role).flatMap((g) => g.items.map((i) => i.id));

describe("getNavGroups — role filtering", () => {
  it("a plain user sees only the main group", () => {
    expect(groupIds("user")).toEqual(["main"]);
  });

  it("admin and superadmin also see the admin group", () => {
    expect(groupIds("admin")).toEqual(["main", "admin"]);
    expect(groupIds("superadmin")).toEqual(["main", "admin"]);
  });

  it.each([null, undefined, "", "Admin", "ADMIN", "root", "moderator", 1, {}])(
    "fails closed for unrecognised role %p (no admin group)",
    (role) => {
      expect(groupIds(role)).toEqual(["main"]);
    }
  );

  it("no admin route ever appears in a plain user's nav", () => {
    const hrefs = getNavGroups("user").flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs.some((h) => h === "/admin" || h.startsWith("/admin/"))).toBe(false);
    expect(itemIds("user")).not.toContain("adminOverview");
  });

  it("every /admin route lives in the role-gated admin group, and only there", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        const isAdminPath = item.href === "/admin" || item.href.startsWith("/admin/");
        expect(isAdminPath).toBe(group.id === "admin");
      }
    }
  });
});

describe("nav config integrity", () => {
  const allItems = NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ group: g, item })));

  it("item ids are unique", () => {
    const ids = allItems.map(({ item }) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hrefs are locale-less absolute paths", () => {
    for (const { item } of allItems) {
      expect(item.href).toMatch(/^\/[a-z]/);
      expect(item.href).not.toMatch(/^\/(ar|en)(\/|$)/);
    }
  });

  it.each(["ar", "en"] as const)("every label key exists in messages/%s.json (nav.*)", (locale) => {
    const nav = loadNavMessages(locale);
    for (const { group, item } of allItems) {
      expect(typeof nav[item.labelKey], `nav.${item.labelKey} (${item.id})`).toBe("string");
      if (group.labelKey) {
        expect(typeof nav[group.labelKey], `nav.${group.labelKey} (group ${group.id})`).toBe("string");
      }
    }
  });

  it("an enabled entry always has a real page file (nav can never link to a 404)", () => {
    for (const { group, item } of allItems.filter(({ item }) => item.enabled)) {
      const routeGroup = group.id === "admin" ? "(admin)" : "(app)";
      const page = join(WEB_ROOT, "app", "[locale]", routeGroup, ...item.href.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(page), `${item.id} is enabled but ${page} does not exist`).toBe(true);
    }
  });
});

describe("isNavItemActive", () => {
  const chat = { href: "/chat" };
  const adminHome = { href: "/admin", exact: true };
  const adminUsers = { href: "/admin/users" };

  it("matches with the locale prefix stripped", () => {
    expect(isNavItemActive("/ar/chat", chat)).toBe(true);
    expect(isNavItemActive("/en/chat", chat)).toBe(true);
  });

  it("sub-paths keep the parent active", () => {
    expect(isNavItemActive("/ar/chat/3f2a", chat)).toBe(true);
    expect(isNavItemActive("/en/admin/users/42", adminUsers)).toBe(true);
  });

  it("ignores a trailing slash", () => {
    expect(isNavItemActive("/en/chat/", chat)).toBe(true);
  });

  it("does not match a sibling that merely shares a prefix", () => {
    expect(isNavItemActive("/en/chatbots", chat)).toBe(false);
    expect(isNavItemActive("/en/billing", chat)).toBe(false);
  });

  it("an exact item is not active on its sub-paths", () => {
    expect(isNavItemActive("/en/admin", adminHome)).toBe(true);
    expect(isNavItemActive("/en/admin/users", adminHome)).toBe(false);
  });

  it("a bare locale root matches nothing", () => {
    expect(isNavItemActive("/ar", chat)).toBe(false);
  });
});
