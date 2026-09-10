import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

// Required by better-auth (apps/web/lib/auth.ts). better-auth's email/password
// strategy stores the hashed password HERE (providerId: "credential"), never
// on users.passwordHash — see users.ts for why that column is now legacy/unused
// by better-auth. This table was previously missing entirely, which meant
// signup and login could not function (better-auth had nowhere to write or
// read credentials).
export const accounts = pgTable("accounts", {
  id:                    text("id").primaryKey(),
  userId:                uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  accountId:             text("account_id").notNull(),
  providerId:            text("provider_id").notNull(),
  accessToken:           text("access_token"),
  refreshToken:          text("refresh_token"),
  idToken:               text("id_token"),
  accessTokenExpiresAt:  timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope:                 text("scope"),
  password:              text("password"),
  createdAt:             timestamp("created_at").defaultNow().notNull(),
  updatedAt:             timestamp("updated_at").defaultNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
