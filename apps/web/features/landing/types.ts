/**
 * apps/web/features/landing/types.ts
 *
 * Phase 3.3. The finished, SERIALISABLE view-models the landing page
 * renders. Everything here is plain data (strings, numbers, booleans,
 * arrays, null) because Server Components hand it to Client Components
 * across the RSC boundary — no functions, no Dates, no class instances.
 *
 * RULE 1 (money is never computed client-side): every price/amount below
 * is already a finished, formatted STRING computed on the server by
 * lib/pricing.ts + lib/format-price.ts. A Client Component may only
 * SELECT between these precomputed values, never derive a new one.
 */

import type { ModelTag } from "./config/model-tags";
import type { MessageSizeId } from "./lib/pricing";

/** Re-exported so client components can import the type from here without
 *  importing lib/pricing.ts (which must stay server-only, Rule 1). */
export type { MessageSizeId };

/** The filter values of the models table's tier dropdown. */
export type TierFilterValue = "free" | "standard" | "premium";

/** What the price columns are denominated in. `credits` is the fallback
 *  when no package exists to derive a YER rate from. */
export type PriceUnit = "yer" | "credits";

export interface LandingModelRow {
  id: string;
  name: string;
  /** Short admin-set badge ("NEW"...), or null. */
  badge: string | null;
  provider: string;
  tier: TierFilterValue;
  contextWindow: number;
  /** Average response time in ms, null when unknown. */
  responseMs: number | null;
  /** "Best for" tags, already deduplicated and capped. */
  tags: ModelTag[];
  /** Formatted price per 1,000 input tokens ("0" for free models). */
  priceIn: string;
  /** Formatted price per 1,000 output tokens ("0" for free models). */
  priceOut: string;
  priceUnit: PriceUnit;
}

export interface LandingPackageView {
  id: string;
  name: string;
  description: string | null;
  /** Whole rials, formatted. */
  priceYer: string;
  /** Display credits, formatted. */
  credits: string;
  bestValue: boolean;
  /** Formatted YER-per-credit for this package (e.g. "2.08"). Precomputed
   *  server-side (Rule 1) so the card never divides two formatted strings. */
  rateLabel: string;
}

/**
 * ONLY these three fields ever reach the browser. The raw
 * billing.listPaymentMethods row also carries `accountCode` (wallet
 * numbers) and `instructions` — the builder never copies them.
 */
export interface LandingPaymentMethodView {
  id: string;
  name: string;
  logoUrl: string | null;
}

/** One (model x message size) calculator result, all pre-formatted. */
export interface CalculatorResultView {
  /** Whole messages the budget buys; null when the model is free. */
  messages: number | null;
  yerPerMessage: string;
  /** YER the worked-example chat costs. */
  chatYer: string;
  /** YER of the budget left after the worked-example chat. */
  remainingYer: string;
  /** 0-100, drives the "balance draining slowly" bar. */
  remainingPercent: number;
  /**
   * Decided on the server (pricing.ts isReassuring). Only when true may
   * the UI say "one chat never takes the whole balance"; otherwise it
   * must state the plain cost. A client component must never recompute it.
   */
  reassuring: boolean;
}

export interface CalculatorModelView {
  id: string;
  name: string;
  isFree: boolean;
  results: Record<MessageSizeId, CalculatorResultView>;
}

export interface CalculatorSizeView {
  id: MessageSizeId;
  inputTokens: number;
  outputTokens: number;
}

export interface CalculatorView {
  /** "1,000" — the budget, formatted. */
  budgetLabel: string;
  /** How many turns the worked example simulates. */
  chatTurns: number;
  sizes: CalculatorSizeView[];
  models: CalculatorModelView[];
  defaultModelId: string;
}

/** One bar of the "cost, ranked" chart. All strings/numbers are finished
 *  server-side (Rule 1): the client only picks a size and draws the bar. */
export interface CostRankRow {
  id: string;
  name: string;
  provider: string;
  /** Stable 0-based index per provider; the client maps it to a colour. */
  colorIndex: number;
  isFree: boolean;
  /** Formatted cost of ONE message (prompt + reply) at this size. */
  priceLabel: string;
  /** 0-100 bar width relative to the priciest model at this size. */
  percent: number;
}

export interface CostRankingView {
  /** `credits` is the fallback when no package gives a YER rate. */
  unit: PriceUnit;
  sizes: CalculatorSizeView[];
  /** Cheapest first, per message size. */
  rows: Record<MessageSizeId, CostRankRow[]>;
}

export interface LandingData {
  /** REAL: the length of models.list. */
  modelCount: number;
  models: LandingModelRow[];
  /** null when there is no usable package to derive a YER rate from. */
  calculator: CalculatorView | null;
  /** null when there are no models. */
  costRanking: CostRankingView | null;
  packages: LandingPackageView[];
  paymentMethods: LandingPaymentMethodView[];
  /** PLACEHOLDER until a public counter exists; null hides the stat. */
  totalUsers: number | null;
}
