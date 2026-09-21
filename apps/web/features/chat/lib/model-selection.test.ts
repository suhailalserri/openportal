import { describe, it, expect } from "vitest";

import {
  resolveSelectedModelId,
  modelDisplayName,
  formatLatency,
  formatTokenSize,
  type ChatModel,
} from "./model-selection";

function model(id: string, overrides: Partial<ChatModel> = {}): ChatModel {
  return {
    id,
    displayName: id.toUpperCase(),
    displayNameAr: `ar-${id}`,
    badge: "",
    provider: "openai",
    tier: "standard",
    contextWindow: 128_000,
    maxOutputTokens: 8192,
    supportsVision: false,
    avgResponseTimeMs: null,
    creditsPerKInput: 1,
    creditsPerKOutput: 3,
    ...overrides,
  };
}

describe("resolveSelectedModelId", () => {
  const available = [model("a"), model("b"), model("c")];

  it("an explicit pick THIS session beats the conversation's own model (picker must respond to a click)", () => {
    expect(
      resolveSelectedModelId(available, {
        sessionPickedModelId: "c",
        conversationModelId: "b",
        lastPickedModelId: "a",
      }),
    ).toBe("c");
  });

  it("a stale session pick falls through to the conversation's model", () => {
    expect(
      resolveSelectedModelId(available, { sessionPickedModelId: "gone", conversationModelId: "b" }),
    ).toBe("b");
  });

  it("prefers the conversation's own model", () => {
    expect(
      resolveSelectedModelId(available, { conversationModelId: "b", lastPickedModelId: "c" }),
    ).toBe("b");
  });

  it("falls back to the last-picked model when the conversation has none", () => {
    expect(resolveSelectedModelId(available, { lastPickedModelId: "c" })).toBe("c");
  });

  it("falls back to the first available model when nothing is stored", () => {
    expect(resolveSelectedModelId(available, {})).toBe("a");
  });

  it("IGNORES a stale last-picked id (model unpublished since) and falls through", () => {
    expect(resolveSelectedModelId(available, { lastPickedModelId: "gone" })).toBe("a");
  });

  it("IGNORES a stale conversation model and uses the last-picked one", () => {
    expect(
      resolveSelectedModelId(available, { conversationModelId: "gone", lastPickedModelId: "c" }),
    ).toBe("c");
  });

  it("returns undefined when no models are available at all", () => {
    expect(resolveSelectedModelId([], { lastPickedModelId: "a" })).toBeUndefined();
  });
});

describe("modelDisplayName", () => {
  it("uses the Arabic name on ar and the English name on en", () => {
    const m = model("x", { displayName: "Fast", displayNameAr: "سريع" });
    expect(modelDisplayName(m, "ar")).toBe("سريع");
    expect(modelDisplayName(m, "en")).toBe("Fast");
  });

  it("falls back to the other language, then the id, so it never renders blank", () => {
    expect(modelDisplayName(model("x", { displayNameAr: "  ", displayName: "Fast" }), "ar")).toBe("Fast");
    expect(modelDisplayName(model("x", { displayNameAr: "", displayName: "" }), "en")).toBe("x");
  });
});

describe("formatLatency", () => {
  it("returns null for unknown/invalid so the caller can render an em dash", () => {
    expect(formatLatency(null)).toBeNull();
    expect(formatLatency(0)).toBeNull();
    expect(formatLatency(-5)).toBeNull();
    expect(formatLatency(Number.NaN)).toBeNull();
  });

  it("formats sub-second as ms and >= 1s as seconds", () => {
    expect(formatLatency(850)).toBe("850ms");
    expect(formatLatency(1200)).toBe("1.2s");
  });
});

describe("formatTokenSize", () => {
  it("compacts round thousands/millions and leaves other values readable", () => {
    expect(formatTokenSize(128_000)).toBe("128K");
    expect(formatTokenSize(1_000_000)).toBe("1M");
    expect(formatTokenSize(8192)).toBe("8,192");
    expect(formatTokenSize(200_000)).toBe("200K");
  });
});
