import { describe, it, expect } from "vitest";

import {
  buildLandingData,
  type BuildDeps,
  type RawModel,
  type RawPackage,
  type RawPaymentMethod,
} from "./build-landing-data";

import { MESSAGE_SIZES } from "./pricing";

const MICRO = 1_000_000;


const model = (over: Partial<RawModel> & { id: string }): RawModel => ({
  displayName: over.id,
  displayNameAr: `ar-${over.id}`,
  badge: "",
  provider: "acme",
  tier: "standard",
  contextWindow: 8_192,
  supportsVision: false,
  avgResponseTimeMs: null,
  creditsPerKInput: 1,
  creditsPerKOutput: 1,
  ...over,
});

const pkg = (over: Partial<RawPackage> & { id: string }): RawPackage => ({
  name: over.id,
  nameAr: `ar-${over.id}`,
  description: null,
  descriptionAr: null,
  priceYer: 5_000,
  credits: 2_000 * MICRO, // 2.5 YER / credit
  ...over,
});

const deps = (over: Partial<BuildDeps> = {}): BuildDeps => ({
  locale: "en",
  microPerCredit: MICRO,
  formatYer: (n) => String(n),
  formatCredits: (n) => String(n / MICRO),
  totalUsers: 1_240,
  ...over,
});

const PKGS = [
  pkg({ id: "p1", priceYer: 5_000, credits: 2_000 * MICRO }), // 2.5 YER/credit (worst)
  pkg({ id: "p2", priceYer: 10_000, credits: 5_000 * MICRO }), // 2.0 YER/credit (best)
];

const MODELS = [
  model({ id: "b", displayName: "Beta", tier: "premium", creditsPerKInput: 15, creditsPerKOutput: 75 }),
  model({ id: "a", displayName: "Alpha", creditsPerKInput: 1, creditsPerKOutput: 2 }),
  model({ id: "f", displayName: "Free One", creditsPerKInput: 0, creditsPerKOutput: 0 }),
  model({ id: "m", displayName: "Mid", creditsPerKInput: 3, creditsPerKOutput: 15 }),
];

describe("buildLandingData — nothing secret reaches the browser", () => {
  const methods: RawPaymentMethod[] = [
    {
      id: "x",
      name: "Jaib",
      nameAr: "جيب",
      logoUrl: "https://cdn.example.com/j.png",
      // Fields the RAW row really carries. The builder must never copy them.
      ...({ accountCode: "WALLET-777-SECRET", instructions: "STEP-SECRET" } as object),
    },
  ];

  it("drops accountCode and instructions from payment methods", () => {
    const out = buildLandingData(MODELS, PKGS, methods, deps());
    const json = JSON.stringify(out);
    expect(json.includes("WALLET-777-SECRET")).toBe(false);
    expect(json.includes("STEP-SECRET")).toBe(false);
    expect(Object.keys(out.paymentMethods[0]!).sort()).toEqual(["id", "logoUrl", "name"]);
  });

  it("never exposes priceUsdEquivalent (internal margin data) from packages", () => {
    const raw = { ...PKGS[0]!, priceUsdEquivalent: "9.99-MARGIN" } as RawPackage;
    const out = buildLandingData(MODELS, [raw], [], deps());
    expect(JSON.stringify(out).includes("MARGIN")).toBe(false);
  });

  it("nulls an unsafe logo URL instead of passing it through", () => {
    const bad: RawPaymentMethod[] = [
      { id: "y", name: "Bad", nameAr: "سيء", logoUrl: "javascript:alert(1)" },
      { id: "z", name: "Ok", nameAr: "جيد", logoUrl: "https://cdn.example.com/ok.png" },
    ];
    const out = buildLandingData(MODELS, PKGS, bad, deps());
    expect(out.paymentMethods[0]!.logoUrl).toBeNull();
    expect(out.paymentMethods[1]!.logoUrl).toBe("https://cdn.example.com/ok.png");
  });
});

describe("buildLandingData — models table", () => {
  it("counts the real models (the 'Models available' stat)", () => {
    expect(buildLandingData(MODELS, PKGS, [], deps()).modelCount).toBe(4);
  });

  it("orders rows by name, independent of input order (models.list has no ORDER BY)", () => {
    const a = buildLandingData(MODELS, PKGS, [], deps());
    const b = buildLandingData([...MODELS].reverse(), PKGS, [], deps());
    expect(a.models.map((m) => m.id)).toEqual(["a", "b", "f", "m"]);
    expect(b.models.map((m) => m.id)).toEqual(a.models.map((m) => m.id));
  });

  it("breaks name ties by id so the order is stable", () => {
    const twins = [model({ id: "z2", displayName: "Same" }), model({ id: "z1", displayName: "Same" })];
    expect(buildLandingData(twins, PKGS, [], deps()).models.map((m) => m.id)).toEqual(["z1", "z2"]);
  });

  it("uses the Arabic name in ar and the English name in en", () => {
    expect(buildLandingData(MODELS, PKGS, [], deps({ locale: "en" })).models[0]!.name).toBe("Alpha");
    expect(buildLandingData(MODELS, PKGS, [], deps({ locale: "ar" })).models[0]!.name).toBe("ar-a");
  });

  it("marks a zero-priced model as tier 'free' and prices it '0'", () => {
    const row = buildLandingData(MODELS, PKGS, [], deps()).models.find((m) => m.id === "f")!;
    expect(row.tier).toBe("free");
    expect(row.priceIn).toBe("0");
    expect(row.priceOut).toBe("0");
  });

  it("does NOT call a model free when only one side is zero", () => {
    const half = model({ id: "h", creditsPerKInput: 0, creditsPerKOutput: 4 });
    expect(buildLandingData([half], PKGS, [], deps()).models[0]!.tier).toBe("standard");
  });

  it("keeps premium vs standard for paid models", () => {
    const rows = buildLandingData(MODELS, PKGS, [], deps()).models;
    expect(rows.find((m) => m.id === "b")!.tier).toBe("premium");
    expect(rows.find((m) => m.id === "m")!.tier).toBe("standard");
  });

  it("converts price per 1,000 tokens to YER at the CONSERVATIVE (worst) rate", () => {
    // Mid: 3 credits/K in * 2.5 = 7.5 ; 15 credits/K out * 2.5 = 37.5
    const row = buildLandingData(MODELS, PKGS, [], deps()).models.find((m) => m.id === "m")!;
    expect(row.priceUnit).toBe("yer");
    expect(row.priceIn).toBe("7.5");
    expect(row.priceOut).toBe("37.5");
  });

  it("falls back to raw credits (and says so) when no package can set a YER rate", () => {
    const row = buildLandingData(MODELS, [], [], deps()).models.find((m) => m.id === "m")!;
    expect(row.priceUnit).toBe("credits");
    expect(row.priceIn).toBe("3");
    expect(row.priceOut).toBe("15");
  });

  it("turns an empty admin badge into null", () => {
    const rows = buildLandingData([model({ id: "n", badge: "NEW" }), model({ id: "e", badge: "" })], PKGS, [], deps()).models;
    expect(rows.find((m) => m.id === "n")!.badge).toBe("NEW");
    expect(rows.find((m) => m.id === "e")!.badge).toBeNull();
  });

  it("passes context window and response time through", () => {
    const row = buildLandingData(
      [model({ id: "c", contextWindow: 200_000, avgResponseTimeMs: 1234 })],
      PKGS,
      [],
      deps(),
    ).models[0]!;
    expect(row.contextWindow).toBe(200_000);
    expect(row.responseMs).toBe(1234);
  });

  it("gives every row at least one tag", () => {
    for (const row of buildLandingData(MODELS, PKGS, [], deps()).models) {
      expect(row.tags.length).toBeGreaterThan(0);
    }
  });
});

describe("buildLandingData — calculator", () => {
  it("is null when there is no package (no YER rate to honestly quote)", () => {
    expect(buildLandingData(MODELS, [], [], deps()).calculator).toBeNull();
  });

  it("is null when there are no models", () => {
    expect(buildLandingData([], PKGS, [], deps()).calculator).toBeNull();
  });

  it("is null when every package is unusable", () => {
    const junk = [pkg({ id: "j", credits: 0 })];
    expect(buildLandingData(MODELS, junk, [], deps()).calculator).toBeNull();
  });

  it("contains every model with a result for each of the three sizes", () => {
    const calc = buildLandingData(MODELS, PKGS, [], deps()).calculator!;
    expect(calc.models.map((m) => m.id).sort()).toEqual(["a", "b", "f", "m"]);
    for (const m of calc.models) {
      expect(Object.keys(m.results).sort()).toEqual(["long", "medium", "short"]);
    }
  });

  it("defaults to the MEDIAN-priced PAID model, not the cheapest (no over-rosy headline)", () => {
    const calc = buildLandingData(MODELS, PKGS, [], deps()).calculator!;
    // Paid, cheapest to priciest at the medium size: a, m, b  ->  upper median = m.
    expect(calc.defaultModelId).toBe("m");
  });

  it("never defaults to a free model when a paid one exists", () => {
    const calc = buildLandingData(MODELS, PKGS, [], deps()).calculator!;
    expect(calc.models.find((m) => m.id === calc.defaultModelId)!.isFree).toBe(false);
  });

  it("falls back to a free model only when ALL models are free", () => {
    const calc = buildLandingData([MODELS[2]!], PKGS, [], deps()).calculator!;
    expect(calc.defaultModelId).toBe("f");
  });

  it("marks free models and gives them a null message count and a full balance", () => {
    const f = buildLandingData(MODELS, PKGS, [], deps()).calculator!.models.find((m) => m.id === "f")!;
    expect(f.isFree).toBe(true);
    expect(f.results.medium.messages).toBeNull();
    expect(f.results.medium.remainingPercent).toBe(100);
  });

  it("matches a hand calculation for Mid / medium at 2.5 YER per credit", () => {
    // 250 in * 3/K + 250 out * 15/K = 4.5 credits = 11.25 YER -> floor(1000/11.25) = 88.
    const r = buildLandingData(MODELS, PKGS, [], deps()).calculator!.models.find((m) => m.id === "m")!.results.medium;
    expect(r.messages).toBe(88);
    expect(r.remainingPercent).toBeCloseTo(71.9, 1);
  });

  it("reports 0% left (not negative) when a chat costs more than the budget", () => {
    const r = buildLandingData(MODELS, PKGS, [], deps()).calculator!.models.find((m) => m.id === "b")!.results.medium;
    expect(r.remainingPercent).toBe(0);
  });

  it("marks a result reassuring only when the worked-example chat leaves >= 50%", () => {
    const calc = buildLandingData(MODELS, PKGS, [], deps()).calculator!;
    const get = (id: string) => calc.models.find((m) => m.id === id)!;
    // Mid/medium leaves ~71.9% -> reassuring. Mid/long leaves ~8% -> NOT.
    expect(get("m").results.medium.reassuring).toBe(true);
    expect(get("m").results.long.reassuring).toBe(false);
    // Beta (pricey) medium is fully spent -> NOT reassuring.
    expect(get("b").results.medium.reassuring).toBe(false);
  });

  it("free models are always reassuring (nothing is spent)", () => {
    const f = buildLandingData(MODELS, PKGS, [], deps()).calculator!.models.find((m) => m.id === "f")!;
    for (const size of ["short", "medium", "long"] as const) {
      expect(f.results[size].reassuring).toBe(true);
    }
  });

  it("judges reassurance on the UNROUNDED share, not the rounded on-screen one (49.96% shows as 50 but is NOT reassuring)", () => {
    // Build a price whose 10-turn medium chat costs exactly 500.4 YER at
    // 2.5 YER/credit, i.e. leaves 49.96% of the 1,000 budget. That rounds
    // to "50" for display, but 49.96 < 50 so it must NOT be reassuring.
    const medium = MESSAGE_SIZES.find((x) => x.id === "medium")!;
    const n = 10;
    const read = medium.inputTokens * ((n * (n + 1)) / 2) + medium.outputTokens * ((n * (n - 1)) / 2);
    const written = medium.outputTokens * n;
    const perK = 500.4 / (2.5 * ((read + written) / 1000));
    const edge = model({ id: "edge", creditsPerKInput: perK, creditsPerKOutput: perK });

    const r = buildLandingData([edge], PKGS, [], deps()).calculator!.models[0]!.results.medium;
    expect(r.remainingPercent).toBe(50); // what the visitor SEES (rounded to 1 dp)
    expect(r.reassuring).toBe(false); // what the server DECIDED (on 49.96)
  });

  it("the same price nudged just under the chat cost IS reassuring (the other side of the line)", () => {
    const medium = MESSAGE_SIZES.find((x) => x.id === "medium")!;
    const n = 10;
    const read = medium.inputTokens * ((n * (n + 1)) / 2) + medium.outputTokens * ((n * (n - 1)) / 2);
    const written = medium.outputTokens * n;
    const perK = 499.6 / (2.5 * ((read + written) / 1000)); // leaves 50.04%
    const edge = model({ id: "edge2", creditsPerKInput: perK, creditsPerKOutput: perK });
    const r = buildLandingData([edge], PKGS, [], deps()).calculator!.models[0]!.results.medium;
    expect(r.reassuring).toBe(true);
  });

  it("exposes the budget label and the chat length the worked example uses", () => {
    const calc = buildLandingData(MODELS, PKGS, [], deps()).calculator!;
    expect(calc.budgetLabel).toBe("1,000");
    expect(calc.chatTurns).toBe(10);
    expect(calc.sizes.map((s) => s.id)).toEqual(["short", "medium", "long"]);
  });

  it("does not let the calculator's internal sort reorder the table", () => {
    const out = buildLandingData(MODELS, PKGS, [], deps());
    expect(out.models.map((m) => m.id)).toEqual(["a", "b", "f", "m"]);
  });
});

describe("buildLandingData — packages", () => {
  it("flags only the strictly best-value package", () => {
    const out = buildLandingData(MODELS, PKGS, [], deps());
    expect(out.packages.map((p) => p.bestValue)).toEqual([false, true]);
  });

  it("flags none when there is a tie or a single package", () => {
    expect(buildLandingData(MODELS, [PKGS[0]!], [], deps()).packages[0]!.bestValue).toBe(false);
    const tie = [pkg({ id: "t1" }), pkg({ id: "t2" })];
    expect(buildLandingData(MODELS, tie, [], deps()).packages.every((p) => !p.bestValue)).toBe(true);
  });

  it("formats price and credits through the injected formatters, and localises name/description", () => {
    const withDesc = [pkg({ id: "d", description: "Best", descriptionAr: "الأفضل" })];
    const en = buildLandingData(MODELS, withDesc, [], deps({ locale: "en" })).packages[0]!;
    const ar = buildLandingData(MODELS, withDesc, [], deps({ locale: "ar" })).packages[0]!;
    expect(en.priceYer).toBe("5000");
    expect(en.credits).toBe("2000");
    expect(en.description).toBe("Best");
    expect(ar.description).toBe("الأفضل");
    expect(ar.name).toBe("ar-d");
  });

  it("turns an empty description into null", () => {
    const p = [pkg({ id: "e", description: "" })];
    expect(buildLandingData(MODELS, p, [], deps()).packages[0]!.description).toBeNull();
  });
});

describe("buildLandingData — empty and pass-through states", () => {
  it("survives everything being empty", () => {
    const out = buildLandingData([], [], [], deps());
    expect(out.modelCount).toBe(0);
    expect(out.models).toEqual([]);
    expect(out.calculator).toBeNull();
    expect(out.packages).toEqual([]);
    expect(out.paymentMethods).toEqual([]);
  });

  it("passes totalUsers through, including null (hides the stat)", () => {
    expect(buildLandingData(MODELS, PKGS, [], deps({ totalUsers: 1_240 })).totalUsers).toBe(1_240);
    expect(buildLandingData(MODELS, PKGS, [], deps({ totalUsers: null })).totalUsers).toBeNull();
  });

  it("produces output that survives a JSON round-trip unchanged (RSC-serialisable)", () => {
    const out = buildLandingData(MODELS, PKGS, [{ id: "x", name: "J", nameAr: "ج", logoUrl: null }], deps());
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it("does not mutate its inputs", () => {
    const models = MODELS.map((m) => ({ ...m }));
    const snap = JSON.stringify(models);
    buildLandingData(models, PKGS, [], deps());
    expect(JSON.stringify(models)).toBe(snap);
  });
});
