#!/usr/bin/env tsx
/**
 * Margin audit (plan P3.6). Reads the LIVE `models` table (published and
 * available models) and prints each one's margin, using the same checks the
 * daily `priceGuard` job runs (apps/api/src/services/price-guard.ts).
 *
 * The previous version read the static MODEL_CATALOG / WHOLESALE_COSTS map,
 * which no longer drives billing (gateway.service.ts bills from the DB).
 *
 * Usage (from repo root; tsx and @ai-platform/db resolve from packages/db):
 *   pnpm --filter @ai-platform/db exec tsx ../../infra/scripts/price-audit.ts
 *   pnpm --filter @ai-platform/db exec tsx ../../infra/scripts/price-audit.ts --offline
 * --offline skips the OpenRouter price feed (margin checks only, no drift).
 * Needs DATABASE_URL. Exit code 1 if any finding, 0 if clean.
 */
import { and, eq } from "drizzle-orm";
import { db, models } from "@ai-platform/db";
import {
  evaluateModelPrices, fetchOpenRouterPrices, fmtUsd, MIN_GROSS_MARGIN,
  type PricedModel, type UpstreamPrice,
} from "../../apps/api/src/services/price-guard";

async function main() {
  const offline = process.argv.includes("--offline");
  const rows = await db.select().from(models).where(and(eq(models.status, "published"), eq(models.isAvailable, true)));
  const list: PricedModel[] = rows.map((r) => ({
    id: r.id,
    markup: Number(r.markupMultiplier),
    wholesaleIn: Number(r.wholesaleCostInputPerM),
    wholesaleOut: Number(r.wholesaleCostOutputPerM),
  }));

  let upstream: Map<string, UpstreamPrice> | null = null;
  if (!offline) {
    try { upstream = await fetchOpenRouterPrices(); }
    catch (err) { console.warn(`! upstream feed unavailable, drift not checked: ${err instanceof Error ? err.message : err}`); }
  }

  const ev = evaluateModelPrices(list, upstream);
  const byModel = new Map<string, string[]>();
  for (const f of ev.findings) byModel.set(f.modelId, [...(byModel.get(f.modelId) ?? []), `${f.severity} ${f.kind}: ${f.detail}`]);

  console.log("\nAI Platform margin audit");
  console.log("=".repeat(78));
  console.log(`${"Model".padEnd(40)} ${"Markup".padEnd(7)} ${"Margin".padEnd(7)} ${"In $/M".padEnd(9)} Out $/M`);
  console.log("-".repeat(78));
  for (const m of list) {
    const margin = m.markup > 0 ? Math.round(((m.markup - 1) / m.markup) * 100) : 0;
    const bad = byModel.has(m.id);
    console.log(`${bad ? "!!" : "ok"} ${m.id.slice(0, 37).padEnd(37)} ${(m.markup + "x").padEnd(7)} ${(margin + "%").padEnd(7)} ${fmtUsd(m.wholesaleIn).padEnd(9)} ${fmtUsd(m.wholesaleOut)}`);
    for (const line of byModel.get(m.id) ?? []) console.log(`     ${line}`);
  }
  console.log("=".repeat(78));
  console.log(`Checked ${ev.checked}; no upstream match: ${ev.unchecked.length}; bar: ${Math.round(MIN_GROSS_MARGIN * 100)}% gross margin.`);
  console.log(ev.findings.length === 0 ? "All clear." : `${ev.findings.length} finding(s) - review pricing.`);
  process.exit(ev.findings.length === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
