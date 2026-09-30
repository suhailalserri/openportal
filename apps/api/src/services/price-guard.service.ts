/**
 * apps/api/src/services/price-guard.service.ts (plan P3.6)
 *
 * DB + alert glue around the pure checks in price-guard.ts. Every external
 * effect (model load, upstream fetch, alert) is injectable, so the tests need
 * neither a container nor the network. Nothing here may throw into a caller:
 * the daily job and the publish hook are both fail-open (L12).
 */
import { db, models } from "@ai-platform/db";
import { and, eq } from "drizzle-orm";
import {
  evaluateModelPrices, formatDigest, fetchOpenRouterPrices,
  type Evaluation, type PricedModel, type UpstreamPrice,
} from "./price-guard";

export type AlertFn = (message: string, level: "warning" | "critical") => void | Promise<unknown>;

export interface PriceGuardDeps {
  loadModels: () => Promise<PricedModel[]>;
  fetchUpstream: () => Promise<Map<string, UpstreamPrice>>;
  alert: AlertFn;
}

type ModelRow = typeof models.$inferSelect;

export function toPricedModel(row: Pick<ModelRow, "id" | "markupMultiplier" | "wholesaleCostInputPerM" | "wholesaleCostOutputPerM">): PricedModel {
  return {
    id: row.id,
    markup: Number(row.markupMultiplier),
    wholesaleIn: Number(row.wholesaleCostInputPerM),
    wholesaleOut: Number(row.wholesaleCostOutputPerM),
  };
}

/** "Active" = what users can actually buy: published AND available. */
export async function loadActiveModels(): Promise<PricedModel[]> {
  const rows = await db
    .select()
    .from(models)
    .where(and(eq(models.status, "published"), eq(models.isAvailable, true)));
  return rows.map(toPricedModel);
}

export interface PriceGuardRun {
  evaluation: Evaluation;
  upstreamError?: string | undefined;
  alerted: boolean;
}

/**
 * Daily job body. Upstream failure degrades to local checks plus a warning line;
 * a failure to load models or to alert propagates so BullMQ/Sentry see it.
 */
export async function runPriceGuard(deps: Partial<PriceGuardDeps> = {}): Promise<PriceGuardRun> {
  const loadModels = deps.loadModels ?? loadActiveModels;
  const fetchUpstream = deps.fetchUpstream ?? (() => fetchOpenRouterPrices());
  const alert = deps.alert ?? (() => { /* wired by the caller (scheduled.jobs.ts) */ });

  const list = await loadModels();

  let upstream: Map<string, UpstreamPrice> | null = null;
  let upstreamError: string | undefined;
  try {
    upstream = await fetchUpstream();
  } catch (err) {
    upstreamError = err instanceof Error ? err.message : String(err);
  }

  const evaluation = evaluateModelPrices(list, upstream);
  const digest = formatDigest(evaluation, { upstreamError });
  if (digest) await alert(digest.message, digest.level);
  return { evaluation, upstreamError, alerted: digest !== null };
}

/**
 * Publish/edit hook: local checks only (no network in the admin request path).
 * Alerts on below-cost or low margin for THIS model right away; upstream drift
 * is left to the daily job. Never throws.
 */
export async function notifyIfPriceUnsafe(
  row: Pick<ModelRow, "id" | "markupMultiplier" | "wholesaleCostInputPerM" | "wholesaleCostOutputPerM">,
  alert: AlertFn,
): Promise<boolean> {
  try {
    const ev = evaluateModelPrices([toPricedModel(row)], null);
    const bad = ev.findings.filter((f) => f.kind === "below_cost" || f.kind === "low_margin" || f.kind === "zero_wholesale");
    if (bad.length === 0) return false;
    const level = bad.some((f) => f.severity === "critical") ? "critical" : "warning";
    const lines = bad.map((f) => `${f.kind} ${f.modelId}: ${f.detail}`);
    await alert(`Price guard: a price was just saved that is unsafe\n${lines.join("\n")}`, level);
    return true;
  } catch {
    return false;
  }
}
