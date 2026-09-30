/**
 * apps/api/src/services/provider-price.service.ts (plan P3.6)
 *
 * Keeps `provider_prices` (append-only price history) in step with the
 * wholesale cost stored on `models`. dashboard.service.ts prices every
 * `usage_debit` transaction from this table; before P3.6 nothing wrote to it,
 * so the admin dashboard's cost was always $0 and margin always ~100%.
 *
 * Unit: `provider_prices` stores USD per 1K tokens (dashboard SQL divides
 * token counts by 1000). `models.wholesale_cost_*_per_m` is per 1M, so the
 * value is divided by 1000 here. numeric(12,8) holds up to 9999.99999999/1K.
 *
 * Rows are never deleted: a change closes the current row (effective_to = now)
 * and opens a new one, so historical transactions keep the price they were
 * billed at.
 */
import { db, providerPrices } from "@ai-platform/db";
import { and, eq, isNull } from "drizzle-orm";

/** `db` or a transaction handle from `db.transaction`. */
export type DbHandle = Pick<typeof db, "select" | "insert" | "update">;

/** provider_prices.model_id is varchar(100); models.id is varchar(150). */
export const PROVIDER_PRICE_MODEL_ID_MAX = 100;

export interface WholesaleSnapshot {
  id: string;
  provider: string;
  wholesaleInPerM: number;
  wholesaleOutPerM: number;
}

export type RecordResult = "inserted" | "changed" | "unchanged" | "skipped_id_too_long";

/** USD/1M -> USD/1K as the exact 8-decimal string stored in the column. */
export function perKString(perM: number): string {
  return (perM / 1000).toFixed(8);
}

export async function recordProviderPrice(
  handle: DbHandle,
  m: WholesaleSnapshot,
  now: Date = new Date(),
): Promise<RecordResult> {
  if (m.id.length > PROVIDER_PRICE_MODEL_ID_MAX) return "skipped_id_too_long";

  const inStr = perKString(m.wholesaleInPerM);
  const outStr = perKString(m.wholesaleOutPerM);

  const current = await handle
    .select()
    .from(providerPrices)
    .where(and(eq(providerPrices.modelId, m.id), isNull(providerPrices.effectiveTo)));

  // Compare numerically: the driver returns "0.00500000", we build "0.00500000".
  const same = current.length === 1
    && Number(current[0]!.inputPriceUsd) === Number(inStr)
    && Number(current[0]!.outputPriceUsd) === Number(outStr)
    && current[0]!.provider === m.provider.slice(0, 50);
  if (same) return "unchanged";

  if (current.length > 0) {
    await handle
      .update(providerPrices)
      .set({ effectiveTo: now })
      .where(and(eq(providerPrices.modelId, m.id), isNull(providerPrices.effectiveTo)));
  }
  await handle.insert(providerPrices).values({
    modelId: m.id,
    provider: m.provider.slice(0, 50),
    inputPriceUsd: inStr,
    outputPriceUsd: outStr,
    effectiveFrom: now,
    effectiveTo: null,
  });
  return current.length > 0 ? "changed" : "inserted";
}
