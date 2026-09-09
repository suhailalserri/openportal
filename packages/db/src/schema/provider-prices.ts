import {
  pgTable, uuid, varchar, numeric, timestamp,
} from "drizzle-orm/pg-core";

/**
 * Tracks provider price changes over time.
 * effectiveTo = null means this is the CURRENT price.
 * Never delete rows — needed for accurate historical billing.
 */
export const providerPrices = pgTable("provider_prices", {
  id:             uuid("id").primaryKey().defaultRandom(),
  modelId:        varchar("model_id",  { length: 100 }).notNull(),
  provider:       varchar("provider",  { length: 50  }).notNull(),
  inputPriceUsd:  numeric("input_price_usd",  { precision: 12, scale: 8 }).notNull(),
  outputPriceUsd: numeric("output_price_usd", { precision: 12, scale: 8 }).notNull(),
  effectiveFrom:  timestamp("effective_from").notNull(),
  effectiveTo:    timestamp("effective_to"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

export type ProviderPrice = typeof providerPrices.$inferSelect;
