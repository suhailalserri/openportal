import { pgTable, uuid, text, timestamp, inet } from "drizzle-orm/pg-core";
import { users } from "./users";

export const sessions = pgTable("sessions", {
  id:        text("id").primaryKey(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  ip:        inet("ip"),
  userAgent: text("user_agent"),
});

export type Session = typeof sessions.$inferSelect;
