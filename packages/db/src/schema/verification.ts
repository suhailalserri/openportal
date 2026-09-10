import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Required by better-auth (apps/web/lib/auth.ts). Backs email verification
// (emailVerification.sendOnSignUp) and password-reset tokens. Was previously
// missing entirely — with requireEmailVerification: true, no user could ever
// complete signup without this table.
export const verifications = pgTable("verifications", {
  id:         text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value:      text("value").notNull(),
  expiresAt:  timestamp("expires_at").notNull(),
  createdAt:  timestamp("created_at").defaultNow(),
  updatedAt:  timestamp("updated_at").defaultNow(),
});

export type Verification = typeof verifications.$inferSelect;
