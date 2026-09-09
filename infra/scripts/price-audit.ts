#!/usr/bin/env tsx
/**
 * Margin audit — prints current margins for all models
 * Usage: pnpm tsx infra/scripts/price-audit.ts
 */
import { MODEL_CATALOG, WHOLESALE_COSTS, CREDIT_VALUE_USD } from "@ai-platform/config";

console.log("\n📊 AI Platform Margin Audit");
console.log("═".repeat(65));
console.log(`${"Model".padEnd(25)} ${"Markup".padEnd(8)} ${"Margin".padEnd(10)} ${"Input/1k".padEnd(10)} ${"Output/1k"}`);
console.log("─".repeat(65));

let allHealthy = true;

MODEL_CATALOG.forEach(model => {
  const w = WHOLESALE_COSTS[model.id];
  if (!w) return;
  const margin = (((model.markupMultiplier - 1) / model.markupMultiplier) * 100).toFixed(0);
  const inputCredits  = Math.ceil((w.input  * model.markupMultiplier / 1000) / CREDIT_VALUE_USD);
  const outputCredits = Math.ceil((w.output * model.markupMultiplier / 1000) / CREDIT_VALUE_USD);
  const isHealthy     = parseInt(margin) >= 40;
  if (!isHealthy) allHealthy = false;

  const icon = isHealthy ? "✅" : "⚠️ ";
  console.log(
    `${icon} ${model.displayName.padEnd(23)} ${(model.markupMultiplier + "x").padEnd(8)} ` +
    `${(margin + "%").padEnd(10)} ${(inputCredits + " cr").padEnd(10)} ${outputCredits} cr`
  );
});

console.log("═".repeat(65));
console.log(allHealthy
  ? "\n✅ All margins healthy (≥ 40%)"
  : "\n⚠️  WARNING: Some models below 40% margin — review pricing!\n"
);
process.exit(allHealthy ? 0 : 1);
