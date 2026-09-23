import { describe, it, expect } from "vitest";

import { parseDataTableParams, buildDataTableSearchParams, toggleSort } from "./data-table-url-state";

describe("parseDataTableParams", () => {
  const defaults = { pageSize: 20 };

  it("falls back to defaults when the URL has no table params", () => {
    const result = parseDataTableParams(new URLSearchParams(""), defaults);
    expect(result).toEqual({ page: 1, pageSize: 20, search: "", sortBy: undefined, sortDir: "desc" });
  });

  it("reads valid params back", () => {
    const result = parseDataTableParams(new URLSearchParams("page=3&pageSize=50&q=ali&sort=email&dir=asc"), defaults);
    expect(result).toEqual({ page: 3, pageSize: 50, search: "ali", sortBy: "email", sortDir: "asc" });
  });

  it.each(["abc", "-3", "0", ""])("treats invalid page %p as page 1", (raw) => {
    const result = parseDataTableParams(new URLSearchParams(`page=${raw}`), defaults);
    expect(result.page).toBe(1);
  });

  it("rejects a garbage sort direction", () => {
    const result = parseDataTableParams(new URLSearchParams("dir=sideways"), defaults);
    expect(result.sortDir).toBe("desc");
  });

  it("namespaces by prefix so two tables don't collide", () => {
    const params = new URLSearchParams("users_page=2&codes_page=5");
    expect(parseDataTableParams(params, defaults, "users").page).toBe(2);
    expect(parseDataTableParams(params, defaults, "codes").page).toBe(5);
    expect(parseDataTableParams(params, defaults).page).toBe(1); // no unprefixed "page" present
  });

  it("respects caller-supplied default sort", () => {
    const result = parseDataTableParams(new URLSearchParams(""), { pageSize: 20, sortBy: "createdAt", sortDir: "asc" });
    expect(result.sortBy).toBe("createdAt");
    expect(result.sortDir).toBe("asc");
  });
});

describe("buildDataTableSearchParams", () => {
  const defaults = { pageSize: 20 };

  it("sets page directly when only page changes", () => {
    const next = buildDataTableSearchParams(new URLSearchParams(""), { page: 4 }, defaults);
    expect(next.get("page")).toBe("4");
  });

  it("resets page to 1 when search changes", () => {
    const current = new URLSearchParams("page=5");
    const next = buildDataTableSearchParams(current, { search: "new query" }, defaults);
    expect(next.get("page")).toBe("1");
    expect(next.get("q")).toBe("new query");
  });

  it("resets page to 1 when sort changes", () => {
    const current = new URLSearchParams("page=5");
    const next = buildDataTableSearchParams(current, { sortBy: "email" }, defaults);
    expect(next.get("page")).toBe("1");
    expect(next.get("sort")).toBe("email");
  });

  it("clears the search param entirely when cleared to empty string", () => {
    const current = new URLSearchParams("q=ali&page=3");
    const next = buildDataTableSearchParams(current, { search: "" }, defaults);
    expect(next.has("q")).toBe(false);
    expect(next.get("page")).toBe("1");
  });

  it("omits pageSize/sort/dir from the URL when they equal the defaults (keeps URLs short)", () => {
    const next = buildDataTableSearchParams(new URLSearchParams(""), { pageSize: 20 }, defaults);
    expect(next.has("pageSize")).toBe(false);
  });

  it("never mutates the URLSearchParams it was given", () => {
    const current = new URLSearchParams("page=1");
    buildDataTableSearchParams(current, { page: 9 }, defaults);
    expect(current.get("page")).toBe("1");
  });

  it("preserves unrelated params and a second table's namespaced params", () => {
    const current = new URLSearchParams("tab=overview&codes_page=5");
    const next = buildDataTableSearchParams(current, { page: 2 }, defaults, "users");
    expect(next.get("tab")).toBe("overview");
    expect(next.get("codes_page")).toBe("5");
    expect(next.get("users_page")).toBe("2");
  });
});

describe("toggleSort", () => {
  it("starts a new column at descending", () => {
    expect(toggleSort({ sortBy: undefined, sortDir: "desc" }, "email")).toEqual({ sortBy: "email", sortDir: "desc" });
  });

  it("flips direction when the same column is clicked again", () => {
    expect(toggleSort({ sortBy: "email", sortDir: "desc" }, "email")).toEqual({ sortBy: "email", sortDir: "asc" });
    expect(toggleSort({ sortBy: "email", sortDir: "asc" }, "email")).toEqual({ sortBy: "email", sortDir: "desc" });
  });

  it("switching to a different column always starts descending, regardless of the previous column's direction", () => {
    expect(toggleSort({ sortBy: "email", sortDir: "asc" }, "createdAt")).toEqual({ sortBy: "createdAt", sortDir: "desc" });
  });
});
