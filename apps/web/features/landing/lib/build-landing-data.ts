import { tagsForModel } from "../config/model-tags";
import type {
  CalculatorModelView,
  CostRankRow,
  CostRankingView,
  CalculatorView,
  LandingData,
  LandingModelRow,
  LandingPackageView,
  LandingPaymentMethodView,
  TierFilterValue,
} from "../types";
import {
  CALCULATOR_BUDGET_YER,
  EXAMPLE_CHAT_TURNS,
  MESSAGE_SIZES,
  bestValuePackageIndex,
  computeSizeResult,
  conservativeYerPerCredit,
  isFreeModel,
  isReassuring,
  type MessageSizeId,
  type SizeResult,
} from "./pricing";
import { formatInteger, formatYerPrecise, type LocaleTag } from "./format-price";
import { safeLogoUrl } from "./safe-url";

/**
 * apps/web/features/landing/lib/build-landing-data.ts
 *
 * Turns the raw rows of the three public procedures (models.list,
 * billing.listPackages, billing.listPaymentMethods) into the finished,
 * serialisable view-models the landing page renders. PURE: no DB, no
 * React, no `@/` imports, so build-landing-data.test.ts can run it in
 * plain node against fixtures. The only impure step — calling the tRPC
 * server caller — lives in landing-data.ts.
 *
 * Structural input types (not imported from the API) on purpose: the
 * wrapper passes the real router output straight in, so a renamed or
 * retyped field in a router fails `tsc` at that one call site.
 */

export interface RawModel {
  id: string;
  displayName: string;
  displayNameAr: string;
  badge: string;
  provider: string;
  tier: string;
  contextWindow: number;
  supportsVision: boolean;
  avgResponseTimeMs: number | null;
  creditsPerKInput: number;
  creditsPerKOutput: number;
}

export interface RawPackage {
  id: string;
  name: string;
  nameAr: string;
  description: string | null;
  descriptionAr: string | null;
  priceYer: number;
  /** Micro-credits. */
  credits: number;
}

export interface RawPaymentMethod {
  id: string;
  name: string;
  nameAr: string;
  logoUrl: string | null;
  // The raw row also carries accountCode/instructions — the builder never
  // reads them, so they cannot reach the browser through this path.
}

export interface BuildDeps {
  locale: LocaleTag;
  microPerCredit: number;
  /** lib/format.ts formatYer — whole rials (package prices). */
  formatYer: (amount: number, locale: LocaleTag) => string;
  /** lib/format.ts formatCredits — micro-credits -> display credits. */
  formatCredits: (micro: number, locale: LocaleTag) => string;
  /** The placeholder-or-real total users figure (null hides the stat). */
  totalUsers: number | null;
}

function tierOf(m: RawModel, free: boolean): TierFilterValue {
  if (free) return "free";
  return m.tier === "premium" ? "premium" : "standard";
}

function toResultView(r: SizeResult, locale: LocaleTag) {
  return {
    messages: r.messages,
    yerPerMessage: formatYerPrecise(r.yerPerMessage, locale),
    chatYer: formatYerPrecise(r.chatYer, locale),
    remainingYer: formatYerPrecise(r.remainingYer, locale),
    remainingPercent: Math.round(r.remainingPercent * 10) / 10,
    // Decided on the UNROUNDED share (49.96 displays as 50 but is not >= 50).
    reassuring: isReassuring(r.remainingPercent),
  };
}

/**
 * "Cost, ranked": what ONE message costs on every model, cheapest
 * first, for each message size. Uses the same conservative YER-per-credit
 * rate as the calculator; with no usable package it falls back to raw
 * credits (unit "credits") instead of hiding the chart.
 */
function buildCostRanking(
  models: readonly RawModel[],
  yerPerCredit: number | null,
  locale: LocaleTag,
  nameOf: (m: RawModel) => string,
): CostRankingView | null {
  if (models.length === 0) return null;

  const rate = yerPerCredit ?? 1;
  const providers = [...new Set(models.map((m) => m.provider))].sort((a, b) => a.localeCompare(b));
  const colorIndexOf = (provider: string) => providers.indexOf(provider);

  const rows = {} as CostRankingView["rows"];
  for (const size of MESSAGE_SIZES) {
    const priced = models.map((m) => {
      const value = computeSizeResult(m, size, rate).yerPerMessage;
      return { m, value, free: isFreeModel(m) };
    });
    const max = Math.max(0, ...priced.map((p) => p.value));
    const sorted = priced.sort(
      (a, b) => a.value - b.value || nameOf(a.m).localeCompare(nameOf(b.m), locale) || a.m.id.localeCompare(b.m.id),
    );
    rows[size.id] = sorted.map(({ m, value, free }): CostRankRow => ({
      id: m.id,
      name: nameOf(m),
      provider: m.provider,
      colorIndex: colorIndexOf(m.provider),
      isFree: free,
      priceLabel: free ? "0" : formatYerPrecise(value, locale),
      // A paying model never renders as an empty bar; a free one does.
      percent: free || max <= 0 ? 0 : Math.max(2, Math.round((value / max) * 1000) / 10),
    }));
  }

  return {
    unit: yerPerCredit === null ? "credits" : "yer",
    sizes: MESSAGE_SIZES.map((s) => ({ id: s.id, inputTokens: s.inputTokens, outputTokens: s.outputTokens })),
    rows,
  };
}

function buildCalculator(
  models: readonly RawModel[],
  yerPerCredit: number,
  locale: LocaleTag,
  nameOf: (m: RawModel) => string,
): CalculatorView | null {
  if (models.length === 0) return null;

  const views: CalculatorModelView[] = [];
  // Unrounded medium-message price per model, used only to pick a default.
  const mediumPrice = new Map<string, number>();
  const medium = MESSAGE_SIZES.find((s) => s.id === "medium") ?? MESSAGE_SIZES[0];

  for (const m of models) {
    const results = {} as CalculatorModelView["results"];
    for (const size of MESSAGE_SIZES) {
      const r = computeSizeResult(m, size, yerPerCredit);
      results[size.id as MessageSizeId] = toResultView(r, locale);
      if (size === medium) mediumPrice.set(m.id, r.yerPerMessage);
    }
    views.push({ id: m.id, name: nameOf(m), isFree: isFreeModel(m), results });
  }

  // Default = the MEDIAN-priced paid model (upper median). Defaulting to
  // the cheapest would headline an over-rosy "12,000 messages".
  const paid = models
    .filter((m) => !isFreeModel(m))
    .sort((a, b) => (mediumPrice.get(a.id) ?? 0) - (mediumPrice.get(b.id) ?? 0));
  const fallback = models[0];
  const pick = paid.length > 0 ? paid[Math.min(paid.length - 1, Math.floor(paid.length / 2))] : fallback;
  if (!pick) return null;

  return {
    budgetLabel: formatInteger(CALCULATOR_BUDGET_YER, locale),
    chatTurns: EXAMPLE_CHAT_TURNS,
    sizes: MESSAGE_SIZES.map((s) => ({
      id: s.id,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
    })),
    models: views,
    defaultModelId: pick.id,
  };
}

export function buildLandingData(
  rawModels: readonly RawModel[],
  rawPackages: readonly RawPackage[],
  rawMethods: readonly RawPaymentMethod[],
  deps: BuildDeps,
): LandingData {
  const { locale, microPerCredit } = deps;
  const nameOf = (m: RawModel) => (locale === "ar" ? m.displayNameAr : m.displayName);

  const yerPerCredit = conservativeYerPerCredit(rawPackages, microPerCredit);
  const priceUnit = yerPerCredit === null ? "credits" : "yer";

  const price = (creditsPerK: number): string =>
    yerPerCredit === null
      ? formatInteger(creditsPerK, locale)
      : formatYerPrecise(creditsPerK * yerPerCredit, locale);

  const models: LandingModelRow[] = rawModels
    .map((m) => {
      const free = isFreeModel(m);
      return {
        id: m.id,
        name: nameOf(m),
        badge: m.badge ? m.badge : null,
        provider: m.provider,
        tier: tierOf(m, free),
        contextWindow: m.contextWindow,
        responseMs: m.avgResponseTimeMs,
        tags: tagsForModel(m),
        priceIn: free ? "0" : price(m.creditsPerKInput),
        priceOut: free ? "0" : price(m.creditsPerKOutput),
        priceUnit,
      } satisfies LandingModelRow;
    })
    // models.list has no ORDER BY, so without this the table order would
    // be whatever Postgres returns — and could reshuffle between visits.
    .sort((a, b) => a.name.localeCompare(b.name, locale) || a.id.localeCompare(b.id));

  const calculator =
    yerPerCredit === null ? null : buildCalculator(rawModels, yerPerCredit, locale, nameOf);
  // buildCalculator sorts a filtered copy only; keep the table order above
  // independent of it.

  const costRanking = buildCostRanking(rawModels, yerPerCredit, locale, nameOf);

  const bestIdx = bestValuePackageIndex(rawPackages, microPerCredit);
  const packages: LandingPackageView[] = rawPackages.map((p, i) => {
    const description = locale === "ar" ? p.descriptionAr : p.description;
    // YER per single credit. Uses the raw row (priceYer / whole credits),
    // never the two formatted strings above — Rule 1.
    const wholeCredits = p.credits / microPerCredit;
    const rateYer = wholeCredits > 0 ? p.priceYer / wholeCredits : 0;
    return {
      id: p.id,
      name: locale === "ar" ? p.nameAr : p.name,
      description: description ? description : null,
      priceYer: deps.formatYer(p.priceYer, locale),
      credits: deps.formatCredits(p.credits, locale),
      bestValue: i === bestIdx,
      rateLabel: formatYerPrecise(rateYer, locale),
    };
  });
  const paymentMethods: LandingPaymentMethodView[] = rawMethods.map((m) => ({
    id: m.id,
    name: locale === "ar" ? m.nameAr : m.name,
    logoUrl: safeLogoUrl(m.logoUrl),
  }));

  return {
    modelCount: rawModels.length,
    models,
    calculator,
    costRanking,
    packages,
    paymentMethods,
    totalUsers: deps.totalUsers,
  };
}
