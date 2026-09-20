/**
 * apps/web/features/landing/lib/pricing.ts
 *
 * Phase 3.3 (docs/FRONTEND_REBUILD_PLAN.md). Pure functions behind the
 * landing page's price column and "How far does 1,000 YER go?"
 * calculator. No I/O, no React, no imports — so it is unit-testable in
 * plain node and can never drift from what the server actually sent.
 *
 * RULE 1 (money is never computed client-side): these functions run in a
 * Server Component (landing-data.ts) only. Client components receive the
 * finished numbers/labels and merely SELECT between precomputed results.
 * Nothing in this file may be imported from a "use client" module.
 *
 * WHAT THE INPUTS ACTUALLY ARE (verified against the code, not assumed):
 *  - `models.list` exposes creditsPerKInput / creditsPerKOutput as WHOLE
 *    credits per 1,000 tokens, already rounded UP per side
 *    (models.router.ts `creditsPerK` uses Math.ceil). The real debit
 *    (gateway.service.ts) is micro-credit precise and is NOT exposed by
 *    any public procedure. So every estimate here is >= the real charge:
 *    a conservative estimate, never an optimistic one. Cheap models are
 *    over-estimated the most (a real 0.3 credits/K shows as 1).
 *  - `billing.listPackages` gives priceYer (integer YER) and credits in
 *    MICRO-credits (1 credit = 1,000,000). YER-per-credit is therefore
 *    priceYer / (credits / microPerCredit).
 */

/** A purchasable package, as returned by billing.listPackages (subset). */
export interface PackageInput {
  priceYer: number;
  /** Micro-credits granted (1 credit = microPerCredit micro-credits). */
  credits: number;
}

/** A model's per-1,000-token price in whole credits (models.list). */
export interface ModelPriceInput {
  creditsPerKInput: number;
  creditsPerKOutput: number;
}

export type MessageSizeId = "short" | "medium" | "long";

export interface MessageSize {
  id: MessageSizeId;
  /** Tokens the user writes. */
  inputTokens: number;
  /** Tokens the model writes back. */
  outputTokens: number;
}

/**
 * One "message" = one prompt + its reply. Totals are about 200 / 500 /
 * 1,500 tokens. THESE ARE ASSUMPTIONS (not measured usage) and are
 * labelled as estimates on screen — change them here, in one place.
 */
export const MESSAGE_SIZES: readonly MessageSize[] = [
  { id: "short", inputTokens: 100, outputTokens: 100 },
  { id: "medium", inputTokens: 250, outputTokens: 250 },
  { id: "long", inputTokens: 500, outputTokens: 1000 },
];

/** The budget the explainer talks about ("How far does 1,000 YER go?"). */
export const CALCULATOR_BUDGET_YER = 1000;

/** How many back-and-forth messages the worked example simulates. */
export const EXAMPLE_CHAT_TURNS = 10;

/** Display ceiling for "about N messages" so tiny prices stay readable. */
export const MAX_DISPLAY_MESSAGES = 100_000;

function isUsablePackage(p: PackageInput): boolean {
  return (
    Number.isFinite(p.priceYer) &&
    Number.isFinite(p.credits) &&
    p.priceYer > 0 &&
    p.credits > 0
  );
}

/** YER paid per single credit for one package. */
export function packageYerPerCredit(pkg: PackageInput, microPerCredit: number): number {
  return pkg.priceYer / (pkg.credits / microPerCredit);
}

/**
 * The rate the calculator uses: the LEAST favourable YER-per-credit among
 * the active packages (i.e. what a small top-up costs). Choosing the worst
 * rate means the page can under-promise but not over-promise. Returns null
 * when there is no usable package — callers must then hide any YER figure.
 */
export function conservativeYerPerCredit(
  packages: readonly PackageInput[],
  microPerCredit: number,
): number | null {
  const rates = packages
    .filter(isUsablePackage)
    .map((p) => packageYerPerCredit(p, microPerCredit));
  if (rates.length === 0) return null;
  return Math.max(...rates);
}

/**
 * Index of the package with the strictly best (lowest) YER-per-credit,
 * or -1 when there is no unique best (a single package, or a tie).
 * Used only for a "best value" badge.
 */
export function bestValuePackageIndex(
  packages: readonly PackageInput[],
  microPerCredit: number,
): number {
  const rates = packages.map((p) =>
    isUsablePackage(p) ? packageYerPerCredit(p, microPerCredit) : Number.POSITIVE_INFINITY,
  );
  const usable = rates.filter((r) => Number.isFinite(r));
  if (usable.length < 2) return -1;
  const min = Math.min(...usable);
  const atMin = rates.filter((r) => r === min).length;
  return atMin === 1 ? rates.indexOf(min) : -1;
}

/** A model whose input AND output price are both zero is shown as free. */
export function isFreeModel(m: ModelPriceInput): boolean {
  return m.creditsPerKInput <= 0 && m.creditsPerKOutput <= 0;
}

/** Credits for a single exchange of the given token counts. */
export function creditsForTokens(
  m: ModelPriceInput,
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1000) * m.creditsPerKInput +
    (outputTokens / 1000) * m.creditsPerKOutput
  );
}

/**
 * Credits for an N-turn conversation of same-sized messages, INCLUDING
 * the fact that every turn re-sends the whole history as input:
 *   turn i reads  i*in + (i-1)*out   tokens and writes  out  tokens.
 * Summed over i = 1..N:  in*N(N+1)/2 + out*N(N-1)/2  read, N*out written.
 * Ignoring this would understate long chats — the exact thing a sceptical
 * visitor would test.
 */
export function creditsForChat(
  m: ModelPriceInput,
  size: Pick<MessageSize, "inputTokens" | "outputTokens">,
  turns: number,
): number {
  const n = Math.max(0, Math.floor(turns));
  const readTokens =
    size.inputTokens * ((n * (n + 1)) / 2) + size.outputTokens * ((n * (n - 1)) / 2);
  const writtenTokens = size.outputTokens * n;
  return creditsForTokens(m, readTokens, writtenTokens);
}

/**
 * Whole messages a budget buys at a given YER-per-message price.
 * null = the message is free (price 0) — there is no meaningful count.
 * Floors (never rounds up) and is capped at MAX_DISPLAY_MESSAGES.
 */
export function messagesForBudget(budgetYer: number, yerPerMessage: number): number | null {
  if (!(yerPerMessage > 0)) return null;
  return Math.min(MAX_DISPLAY_MESSAGES, Math.floor(budgetYer / yerPerMessage));
}

export interface SizeResult {
  /** Whole messages the budget buys; null when the model is free. */
  messages: number | null;
  /** YER for one message (unrounded). */
  yerPerMessage: number;
  /** YER for the worked-example chat (unrounded). */
  chatYer: number;
  /** YER left of the budget after the worked-example chat (>= 0). */
  remainingYer: number;
  /** remainingYer as a 0-100 percentage of the budget. */
  remainingPercent: number;
}

/** Everything the calculator shows for one (model, size) pair. */
export function computeSizeResult(
  m: ModelPriceInput,
  size: MessageSize,
  yerPerCredit: number,
  budgetYer: number = CALCULATOR_BUDGET_YER,
  turns: number = EXAMPLE_CHAT_TURNS,
): SizeResult {
  const yerPerMessage = creditsForTokens(m, size.inputTokens, size.outputTokens) * yerPerCredit;
  const chatYer = creditsForChat(m, size, turns) * yerPerCredit;
  const remainingYer = Math.max(0, budgetYer - chatYer);
  return {
    messages: messagesForBudget(budgetYer, yerPerMessage),
    yerPerMessage,
    chatYer,
    remainingYer,
    remainingPercent: budgetYer > 0 ? (remainingYer / budgetYer) * 100 : 0,
  };
}
