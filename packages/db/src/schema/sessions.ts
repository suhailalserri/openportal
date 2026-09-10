import { pgTable, uuid, text, timestamp, inet } from "drizzle-orm/pg-core";
import { users } from "./users";

export const sessions = pgTable("sessions", {
  id:        text("id").primaryKey(),
  // better-auth's session cookie carries this `token` value and looks
  // sessions up BY TOKEN, never by `id` (id is an internal row identifier).
  // This column was missing entirely — the api's auth.middleware.ts / trpc.ts
  // were querying `eq(sessions.id, cookie)`, which can never match the token
  // value better-auth actually puts in the cookie. Must be unique: it's the
  // sole credential used to authenticate a request.
  token:     text("token").notNull().unique(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ip:        inet("ip"),
  userAgent: text("user_agent"),
});

export type Session = typeof sessions.$inferSelect;
