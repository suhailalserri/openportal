import {
  pgTable, uuid, varchar, timestamp, inet, jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/** Immutable log of every admin action. Never delete rows from this table. */
export const auditLogs = pgTable("audit_logs", {
  id:         uuid("id").primaryKey().defaultRandom(),
  adminId:    uuid("admin_id").references(() => users.id).notNull(),
  action:     varchar("action",      { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId:   uuid("target_id"),
  before:     jsonb("before"),
  after:      jsonb("after"),
  ip:         inet("ip"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog    = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
