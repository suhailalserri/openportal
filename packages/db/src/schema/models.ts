import {
  pgTable, varchar, boolean, integer,
  bigint, timestamp, uuid, numeric,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Runtime model configuration — stored in DB so admins can toggle
 * availability, adjust display names, and change markup without a redeploy.
 * Seeded from MODEL_CATALOG in packages/config/src/models.config.ts.
 */
export const models = pgTable("models", {
  id:               varchar("id", { length: 100 }).primaryKey(),
  displayName:      varchar("display_name",    { length: 100 }).notNull(),
  displayNameAr:    varchar("display_name_ar", { length: 100 }).notNull(),
  badge:            varchar("badge",    { length: 10  }).default("").notNull(),
  provider:         varchar("provider", { length: 50  }).notNull(),
  tier:             varchar("tier",     { length: 20  }).default("standard").notNull(),
  isAvailable:      boolean("is_available").default(true).notNull(),
  // Stored as string because numeric columns return strings from pg driver
  markupMultiplier: numeric("markup_multiplier", { precision: 4, scale: 2 }).default("2.0").notNull(),
  contextWindow:    integer("context_window").notNull(),
  maxOutputTokens:  integer("max_output_tokens").notNull(),
  supportsVision:   boolean("supports_vision").default(false).notNull(),
  // Aggregate usage stats (updated post-stream via background job)
  totalRequests:    bigint("total_requests",  { mode: "number" }).default(0).notNull(),
  totalTokensIn:    bigint("total_tokens_in", { mode: "number" }).default(0).notNull(),
  totalTokensOut:   bigint("total_tokens_out",{ mode: "number" }).default(0).notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
  updatedByAdminId: uuid("updated_by_admin_id").references(() => users.id),
});

export type Model    = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
