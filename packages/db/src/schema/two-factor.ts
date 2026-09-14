import { pgTable, text, uuid, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

// Required by better-auth's `twoFactor` plugin (see apps/web/lib/auth.ts).
// The plugin owns this table itself — it never reads/writes
// `users.twoFactorSecret`. That column is legacy/unused, same situation as
// `users.passwordHash` (see that column's comment in users.ts): it was
// presumably added anticipating 2FA before the plugin was wired up, and
// the plugin brings its own storage instead. `users.twoFactorEnabled` DOES
// match the plugin's expected field name, so that one *is* live — it's
// flipped to true only after the user verifies their first TOTP code.
export const twoFactor = pgTable("two_factor", {
  id:     text("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  secret: text("secret").notNull(),
  // JSON-stringified array of hashed/encrypted backup codes — better-auth
  // manages the encoding, this is just opaque storage from our side.
  backupCodes: text("backup_codes").notNull(),
  // Full official column set per better-auth's twoFactor plugin docs
  // (id, userId, secret, backupCodes, verified, failedVerificationCount,
  // lockedUntil) — the last three back the account-lockout feature
  // (locks after repeated failed verifications), added in a 1.x minor
  // version. The deploy log's own "Drizzle schema mismatch: Missing
  // columns twoFactor.lockedUntil" is what caught this being incomplete
  // the first time around.
  verified:                boolean("verified").default(false).notNull(),
  failedVerificationCount: integer("failed_verification_count").default(0).notNull(),
  // Nullable: null means "not currently locked". Set by better-auth's
  // account-lockout feature after too many consecutive failed 2FA
  // verifications; cleared again once the cooldown passes or a
  // verification succeeds.
  lockedUntil:             timestamp("locked_until"),
  createdAt:               timestamp("created_at").defaultNow().notNull(),
  updatedAt:               timestamp("updated_at").defaultNow().notNull(),
});

export type TwoFactor    = typeof twoFactor.$inferSelect;
export type NewTwoFactor = typeof twoFactor.$inferInsert;
