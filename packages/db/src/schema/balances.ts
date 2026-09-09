import { pgTable, uuid, bigint, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * One row per user. Credits stored as micro-credits.
 * 1 display credit = 1,000,000 micro-credits (avoids float errors).
 * DB constraint enforces credits >= 0 (applied in 0001_constraints.sql).
 *
 * MICRO_CREDIT constant lives in @ai-platform/config/constants — single source of truth.
 */
export const balances = pgTable("balances", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         uuid("user_id")
                    .references(() => users.id, { onDelete: "cascade" })
                    .unique()
                    .notNull(),
  credits:        bigint("credits",         { mode: "number" }).default(0).notNull(),
  totalSpent:     bigint("total_spent",     { mode: "number" }).default(0).notNull(),
  totalRedeemed:  bigint("total_redeemed",  { mode: "number" }).default(0).notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
});

export type Balance    = typeof balances.$inferSelect;
export type NewBalance = typeof balances.$inferInsert;
