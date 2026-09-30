/**
 * P3.6 - pure price-guard logic. No database, no network, no containers.
 * Red-on-old-code: none of this existed; the old price-audit script read a
 * static catalogue and nothing alerted.
 */
import { describe, it, expect, vi } from "vitest";
import {
  evaluateModelPrices, formatDigest, parseOpenRouterPrices, fetchOpenRouterPrices, fmtUsd,
  MIN_GROSS_MARGIN, type PricedModel, type UpstreamPrice,
} from "./price-guard";

const model = (o: Partial<PricedModel> = {}): PricedModel => ({
  id: "vendor/model-a", markup: 2, wholesaleIn: 1, wholesaleOut: 2, ...o,
});
const feed = (entries: Record<string, UpstreamPrice>) => new Map(Object.entries(entries));
const kinds = (m: PricedModel[], up: Map<string, UpstreamPrice> | null, opts = {}) =>
  evaluateModelPrices(m, up, opts).findings.map((f) => f.kind);

describe("evaluateModelPrices - margin", () => {
  it("a 2x markup (50% margin) is clean", () => {
    expect(kinds([model()], null)).toEqual([]);
  });

  it("markup below 1 sells under cost: critical below_cost", () => {
    const ev = evaluateModelPrices([model({ markup: 0.8 })], null);
    expect(ev.findings).toHaveLength(1);
    expect(ev.findings[0]).toMatchObject({ kind: "below_cost", severity: "critical", modelId: "vendor/model-a" });
  });

  it("markup exactly 1 is zero margin: low_margin, not below_cost", () => {
    expect(kinds([model({ markup: 1 })], null)).toEqual(["low_margin"]);
  });

  it("uses the default 40% bar: 1.6x (37.5%) warns, 2x passes", () => {
    expect(MIN_GROSS_MARGIN).toBe(0.4);
    expect(kinds([model({ markup: 1.6 })], null)).toEqual(["low_margin"]);
    expect(kinds([model({ markup: 2 })], null)).toEqual([]);
  });

  it("a margin exactly at the bar passes; just under it warns", () => {
    expect(kinds([model({ markup: 1.25 })], null, { minMargin: 0.2 })).toEqual([]);
    expect(kinds([model({ markup: 1.24 })], null, { minMargin: 0.2 })).toEqual(["low_margin"]);
  });

  it("the worst side decides: a fine input side cannot hide a below-cost output side", () => {
    // sell = wholesale * markup on both sides, so make only the OUTPUT cost jump via upstream
    const up = feed({ "vendor/model-a": { input: 1, output: 5 } }); // output sells at 4, costs 5
    const ev = evaluateModelPrices([model()], up);
    const below = ev.findings.find((f) => f.kind === "below_cost");
    expect(below).toBeDefined();
    expect(below!.detail).toContain("output");
  });

  it("a free side (cost 0) is skipped, not treated as a loss", () => {
    expect(kinds([model({ wholesaleIn: 0, wholesaleOut: 2 })], null)).toEqual([]);
  });
});

describe("evaluateModelPrices - upstream", () => {
  it("upstream cost higher than what we sell for is critical, and reported as drift too", () => {
    const up = feed({ "vendor/model-a": { input: 3, output: 2 } }); // input sells at 2, costs 3
    const k = kinds([model()], up);
    expect(k).toContain("below_cost");
    expect(k).toContain("upstream_drift");
  });

  it("wholesale 0 while upstream charges is below_cost (we are selling it free)", () => {
    const up = feed({ "vendor/model-a": { input: 1, output: 2 } });
    const ev = evaluateModelPrices([model({ wholesaleIn: 0, wholesaleOut: 0 })], up);
    expect(ev.findings.some((f) => f.kind === "below_cost" && f.severity === "critical")).toBe(true);
  });

  it("wholesale 0 and upstream also 0 is a genuinely free model: clean", () => {
    const up = feed({ "vendor/model-a": { input: 0, output: 0 } });
    expect(kinds([model({ wholesaleIn: 0, wholesaleOut: 0 })], up)).toEqual([]);
  });

  it("drift inside 5% is ignored, outside is a warning", () => {
    expect(kinds([model()], feed({ "vendor/model-a": { input: 1.04, output: 2 } }))).toEqual([]);
    const ev = evaluateModelPrices([model()], feed({ "vendor/model-a": { input: 1.2, output: 2 } }));
    expect(ev.findings).toHaveLength(1);
    expect(ev.findings[0]).toMatchObject({ kind: "upstream_drift", severity: "warning" });
  });

  it("models with no upstream match are listed as unchecked, never silently passed", () => {
    const ev = evaluateModelPrices([model(), model({ id: "other/thing" })], feed({ "vendor/model-a": { input: 1, output: 2 } }));
    expect(ev.unchecked).toEqual(["other/thing"]);
    expect(ev.checked).toBe(2);
  });

  it("with no feed at all, unchecked stays empty (nothing was compared)", () => {
    expect(evaluateModelPrices([model()], null).unchecked).toEqual([]);
  });

  it("matches ids case-insensitively", () => {
    const up = feed({ "vendor/model-a": { input: 5, output: 5 } });
    expect(kinds([model({ id: "Vendor/Model-A" })], up)).toContain("below_cost");
  });
});

describe("evaluateModelPrices - unpriced models", () => {
  it("zero wholesale on a non-free model with no upstream match warns", () => {
    expect(kinds([model({ wholesaleIn: 0, wholesaleOut: 0 })], null)).toEqual(["zero_wholesale"]);
  });
  it("a :free model at zero is fine", () => {
    expect(kinds([model({ id: "vendor/x:free", wholesaleIn: 0, wholesaleOut: 0 })], null)).toEqual([]);
  });
});

describe("formatDigest", () => {
  it("returns null when clean", () => {
    expect(formatDigest(evaluateModelPrices([model()], null))).toBeNull();
  });

  it("critical findings make a critical digest, listed before warnings", () => {
    const ev = evaluateModelPrices([model({ id: "warn/one", markup: 1 }), model({ id: "bad/one", markup: 0.5 })], null);
    const d = formatDigest(ev)!;
    expect(d.level).toBe("critical");
    const lines = d.message.split("\n");
    expect(lines[0]).toMatch(/1 critical, 1 warning/);
    expect(lines[1]).toMatch(/^CRITICAL below_cost bad\/one/);
    expect(lines[2]).toMatch(/^warn low_margin warn\/one/);
  });

  it("warnings only make a warning digest", () => {
    expect(formatDigest(evaluateModelPrices([model({ markup: 1 })], null))!.level).toBe("warning");
  });

  it("an upstream feed failure alone still produces a message (a broken check must not look healthy)", () => {
    const d = formatDigest(evaluateModelPrices([model()], null), { upstreamError: "OpenRouter models list returned 503" })!;
    expect(d.level).toBe("warning");
    expect(d.message).toContain("Upstream price feed unavailable");
    expect(d.message).toContain("503");
  });

  it("caps the list at 15 lines and says how many were cut", () => {
    const many = Array.from({ length: 20 }, (_, i) => model({ id: `m/${i}`, markup: 0.5 }));
    const lines = formatDigest(evaluateModelPrices(many, null))!.message.split("\n");
    expect(lines).toHaveLength(1 + 15 + 1);
    expect(lines[lines.length - 1]).toContain("5 more");
  });
});

describe("parseOpenRouterPrices", () => {
  it("converts USD-per-token strings to USD per 1M", () => {
    const m = parseOpenRouterPrices({ data: [{ id: "a/b", pricing: { prompt: "0.0000025", completion: "0.00001" } }] });
    expect(m.get("a/b")!.input).toBeCloseTo(2.5, 6);
    expect(m.get("a/b")!.output).toBeCloseTo(10, 6);
  });

  it("treats free models as 0/0", () => {
    const m = parseOpenRouterPrices({ data: [{ id: "a/b:free", pricing: { prompt: "0", completion: "0" } }] });
    expect(m.get("a/b:free")).toEqual({ input: 0, output: 0 });
  });

  it("skips dynamic (-1), negative, missing and malformed entries without throwing", () => {
    const m = parseOpenRouterPrices({
      data: [
        { id: "router/auto", pricing: { prompt: "-1", completion: "-1" } },
        { id: "no/pricing" },
        { id: "bad/num", pricing: { prompt: "abc", completion: "1" } },
        null, 42, { pricing: { prompt: "1", completion: "1" } },
        { id: "ok/one", pricing: { prompt: "0.000001", completion: "0.000002" } },
      ],
    });
    expect([...m.keys()]).toEqual(["ok/one"]);
  });

  it("also indexes canonical_slug when it differs from id", () => {
    const m = parseOpenRouterPrices({ data: [{ id: "a/b", canonical_slug: "a/b-2026", pricing: { prompt: "0.000001", completion: "0.000001" } }] });
    expect(m.has("a/b-2026")).toBe(true);
  });

  it("returns an empty map for a body of the wrong shape", () => {
    expect(parseOpenRouterPrices(null).size).toBe(0);
    expect(parseOpenRouterPrices({ data: "nope" }).size).toBe(0);
  });
});

describe("fetchOpenRouterPrices", () => {
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it("returns parsed prices on 200", async () => {
    const m = await fetchOpenRouterPrices({ fetchImpl: ok({ data: [{ id: "a/b", pricing: { prompt: "0.000001", completion: "0.000002" } }] }) });
    expect(m.get("a/b")!.output).toBeCloseTo(2, 6);
  });
  it("throws on a non-200", async () => {
    const f = vi.fn(async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchOpenRouterPrices({ fetchImpl: f })).rejects.toThrow(/503/);
  });
  it("throws when the body has no usable prices (so the job reports the feed as broken)", async () => {
    await expect(fetchOpenRouterPrices({ fetchImpl: ok({ data: [] }) })).rejects.toThrow(/no usable prices/);
  });
  it("propagates a network failure", async () => {
    const f = vi.fn(async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    await expect(fetchOpenRouterPrices({ fetchImpl: f })).rejects.toThrow("ECONNRESET");
  });
});

describe("fmtUsd", () => {
  it("trims trailing zeros", () => {
    expect(fmtUsd(2.5)).toBe("$2.5");
    expect(fmtUsd(0.075)).toBe("$0.075");
  });
});
