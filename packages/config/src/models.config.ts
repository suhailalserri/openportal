import type { ModelConfig } from "@ai-platform/types";

/** 1 display credit = $0.001 USD */
export const CREDIT_VALUE_USD = 0.001;

/** Wholesale costs per 1M tokens (USD). Update when providers change prices. */
export const WHOLESALE_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4o":            { input:  5.00, output: 15.00 },
  "gpt-4o-mini":       { input:  0.15, output:  0.60 },
  "claude-opus-4-8":   { input: 15.00, output: 75.00 },
  "claude-sonnet-4-6": { input:  3.00, output: 15.00 },
  "claude-haiku-4-5":  { input:  0.80, output:  4.00 },
  "gemini-2.5-pro":    { input:  1.25, output: 10.00 },
  "gemini-2.5-flash":  { input:  0.075,output:  0.30 },
  "deepseek-r2":       { input:  0.55, output:  2.19 },
  "deepseek-v3":       { input:  0.27, output:  1.10 },
};

/** Calculate credits per 1K tokens for display in UI */
function creditsPerK(priceUsdPerM: number, markup: number): number {
  return Math.ceil((priceUsdPerM * markup / 1000) / CREDIT_VALUE_USD);
}

export const MODEL_CATALOG: ModelConfig[] = [
  {
    id:               "gpt-4o",
    displayName:      "GPT-4o",
    displayNameAr:    "جي بي تي 4o",
    badge:            "⚡",
    provider:         "openai",
    tier:             "premium",
    markupMultiplier: 2.0,
    contextWindow:    128_000,
    maxOutputTokens:  16_384,
    supportsVision:   true,
    supportsStreaming: true,
    isAvailable:      true,
    get creditsPerKInput()  { return creditsPerK(WHOLESALE_COSTS["gpt-4o"]!.input,  this.markupMultiplier); },
    get creditsPerKOutput() { return creditsPerK(WHOLESALE_COSTS["gpt-4o"]!.output, this.markupMultiplier); },
  },
  {
    id:               "gpt-4o-mini",
    displayName:      "GPT-4o Mini",
    displayNameAr:    "جي بي تي 4o ميني",
    badge:            "🚀",
    provider:         "openai",
    tier:             "standard",
    markupMultiplier: 2.0,
    contextWindow:    128_000,
    maxOutputTokens:  16_384,
    supportsVision:   true,
    supportsStreaming: true,
    isAvailable:      true,
    get creditsPerKInput()  { return creditsPerK(WHOLESALE_COSTS["gpt-4o-mini"]!.input,  this.markupMultiplier); },
    get creditsPerKOutput() { return creditsPerK(WHOLESALE_COSTS["gpt-4o-mini"]!.output, this.markupMultiplier); },
  },
  {
    id:               "claude-opus-4-8",
    displayName:      "Claude Opus 4.8",
    displayNameAr:    "كلود أوبوس 4.8",
    badge:            "🆕",
    provider:         "anthropic",
    tier:             "premium",
    markupMultiplier: 2.5,
    contextWindow:    200_000,
    maxOutputTokens:  32_768,
    supportsVision:   true,
    supportsStreaming: true,
    isAvailable:      true,
    get creditsPerKInput()  { return creditsPerK(WHOLESALE_COSTS["claude-opus-4-8"]!.input,  this.markupMultiplier); },
    get creditsPerKOutput() { return creditsPerK(WHOLESALE_COSTS["claude-opus-4-8"]!.output, this.markupMultiplier); },
  },
  {
    id:               "claude-sonnet-4-6",
    displayName:      "Claude Sonnet 4.6",
    displayNameAr:    "كلود سونيت 4.6",
    badge:            "💡",
    provider:         "anthropic",
    tier:             "standard",
    markupMultiplier: 2.0,
    contextWindow:    200_000,
    maxOutputTokens:  16_384,
    supportsVision:   true,
    supportsStreaming: true,
    isAvailable:      true,
    get creditsPerKInput()  { return creditsPerK(WHOLESALE_COSTS["claude-sonnet-4-6"]!.input,  this.markupMultiplier); },
    get creditsPerKOutput() { return creditsPerK(WHOLESALE_COSTS["claude-sonnet-4-6"]!.output, this.markupMultiplier); },
  },
  {
    id:               "gemini-2.5-pro",
    displayName:      "Gemini 2.5 Pro",
    displayNameAr:    "جيميني 2.5 برو",
    badge:            "💎",
    provider:         "google",
    tier:             "premium",
    markupMultiplier: 2.0,
    contextWindow:    1_000_000,
    maxOutputTokens:  65_536,
    supportsVision:   true,
    supportsStreaming: true,
    isAvailable:      true,
    get creditsPerKInput()  { return creditsPerK(WHOLESALE_COSTS["gemini-2.5-pro"]!.input,  this.markupMultiplier); },
    get creditsPerKOutput() { return creditsPerK(WHOLESALE_COSTS["gemini-2.5-pro"]!.output, this.markupMultiplier); },
  },
  {
    id:               "gemini-2.5-flash",
    displayName:      "Gemini 2.5 Flash",
    displayNameAr:    "جيميني 2.5 فلاش",
    badge:            "⚡",
    provider:         "google",
    tier:             "standard",
    markupMultiplier: 1.8,
    contextWindow:    1_000_000,
    maxOutputTokens:  32_768,
    supportsVision:   true,
    supportsStreaming: true,
    isAvailable:      true,
    get creditsPerKInput()  { return creditsPerK(WHOLESALE_COSTS["gemini-2.5-flash"]!.input,  this.markupMultiplier); },
    get creditsPerKOutput() { return creditsPerK(WHOLESALE_COSTS["gemini-2.5-flash"]!.output, this.markupMultiplier); },
  },
  {
    id:               "deepseek-r2",
    displayName:      "DeepSeek R2",
    displayNameAr:    "ديب سيك R2",
    badge:            "🧠",
    provider:         "deepseek",
    tier:             "standard",
    markupMultiplier: 1.8,
    contextWindow:    64_000,
    maxOutputTokens:  8_192,
    supportsVision:   false,
    supportsStreaming: true,
    isAvailable:      true,
    get creditsPerKInput()  { return creditsPerK(WHOLESALE_COSTS["deepseek-r2"]!.input,  this.markupMultiplier); },
    get creditsPerKOutput() { return creditsPerK(WHOLESALE_COSTS["deepseek-r2"]!.output, this.markupMultiplier); },
  },
];

/** Calculate exact micro-credit cost for a request */
export function calculateCreditCost(
  modelId:      string,
  inputTokens:  number,
  outputTokens: number
): number {
  const wholesale = WHOLESALE_COSTS[modelId];
  const model     = MODEL_CATALOG.find(m => m.id === modelId);
  if (!wholesale || !model) throw new Error(`Unknown model: ${modelId}`);

  const inputCost  = (inputTokens  / 1_000_000) * wholesale.input  * model.markupMultiplier;
  const outputCost = (outputTokens / 1_000_000) * wholesale.output * model.markupMultiplier;
  const totalUsd   = inputCost + outputCost;

  // Always round UP (protects margins), minimum 1 micro-credit
  return Math.max(Math.ceil((totalUsd / CREDIT_VALUE_USD) * 1_000_000), 1);
}

/** Display human-readable credit amount */
export function formatCredits(microCredits: number): string {
  return (microCredits / 1_000_000).toFixed(2);
}

/** Estimate tokens from text (rough: ~4 chars per token) */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Run margin audit (call from CLI) */
export function auditMargins(): void {
  console.log("\n📊 Margin Audit:");
  MODEL_CATALOG.forEach(m => {
    const margin = (((m.markupMultiplier - 1) / m.markupMultiplier) * 100).toFixed(0);
    console.log(`  ${m.displayName.padEnd(25)} ${margin}% margin (${m.markupMultiplier}x markup)`);
  });
}
