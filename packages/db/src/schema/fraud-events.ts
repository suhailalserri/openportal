import {
  pgTable, uuid, text, boolean,
  timestamp, inet, jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { fraudTypeEnum, fraudSeverityEnum } from "./enums";

export const fraudEvents = pgTable("fraud_events", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").references(() => users.id),
  type:        fraudTypeEnum("type").notNull(),
  severity:    fraudSeverityEnum("severity").notNull(),
  details:     jsonb("details"),
  ip:          inet("ip"),
  userAgent:   text("user_agent"),
  resolved:    boolean("resolved").default(false).notNull(),
  resolvedBy:  uuid("resolved_by"),
  resolvedAt:  timestamp("resolved_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export type FraudEvent    = typeof fraudEvents.$inferSelect;
export type NewFraudEvent = typeof fraudEvents.$inferInsert;
