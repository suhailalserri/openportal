import { describe, it, expect } from "vitest";

import { buildExportUrl } from "./build-export-url";

describe("buildExportUrl", () => {
  it("no filters → bare path, no trailing '?'", () => {
    expect(buildExportUrl({})).toBe("/api/usage/export");
  });

  it("includes only the filters that are set", () => {
    expect(buildExportUrl({ modelId: "nex-agi/nex-n2.5-pro" })).toBe(
      "/api/usage/export?modelId=nex-agi%2Fnex-n2.5-pro"
    );
  });

  it("includes from/to/modelId together, in a stable order", () => {
    const url = buildExportUrl({ from: "2026-06-01", to: "2026-06-30", modelId: "gpt-4o" });
    expect(url).toBe("/api/usage/export?from=2026-06-01&to=2026-06-30&modelId=gpt-4o");
  });

  it("ignores empty-string filters (treated as unset)", () => {
    expect(buildExportUrl({ from: "", to: "", modelId: "" })).toBe("/api/usage/export");
  });

  it("round-trips through URLSearchParams parsing", () => {
    const url = buildExportUrl({ from: "2026-01-01", modelId: "a b/c" });
    const parsed = new URL(url, "https://example.test");
    expect(parsed.searchParams.get("from")).toBe("2026-01-01");
    expect(parsed.searchParams.get("modelId")).toBe("a b/c");
    expect(parsed.searchParams.has("to")).toBe(false);
  });
});
