import {
  pgTable, uuid, varchar, text, timestamp,
  boolean, inet,
} from "drizzle-orm/pg-core";
import {
  userRoleEnum, userStatusEnum, userTierEnum,
} from "./enums";

export const users = pgTable("users", {
  id:               uuid("id").primaryKey().defaultRandom(),
  email:            varchar("email",        { length: 255 }).unique().notNull(),
  // Legacy column — better-auth's email/password strategy stores the actual
  // credential hash in `accounts.password` (providerId "credential"), never
  // here. Kept nullable so better-auth's own insert (which doesn't know this
  // column exists) doesn't fail a NOT NULL constraint. NOT the source of
  // truth for auth — do not compare against this in new code.
  passwordHash:     text("password_hash"),
  displayName:      varchar("display_name", { length: 100 }),
  role:             userRoleEnum("role").default("user").notNull(),
  status:           userStatusEnum("status").default("pending_verification").notNull(),
  emailVerified:    boolean("email_verified").default(false).notNull(),
  locale:           varchar("locale",  { length: 5 }).default("ar").notNull(),
  tier:             userTierEnum("tier").default("free").notNull(),
  avatarUrl:        text("avatar_url"),
  // Developer API key (hashed — shown once on creation)
  apiKeyHash:       varchar("api_key_hash",   { length: 128 }).unique(),
  apiKeyPrefix:     varchar("api_key_prefix", { length: 20 }),
  // Two-factor authentication
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorSecret:  text("two_factor_secret"),
  // Fraud tracking
  isFraudFlagged:   boolean("is_fraud_flagged").default(false).notNull(),
  fraudReason:      text("fraud_reason"),
  // Referral system
  referralCode:     varchar("referral_code", { length: 12 }).unique(),
  referredByUserId: uuid("referred_by_user_id"),
  // Timestamps
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
  lastSeenAt:       timestamp("last_seen_at"),
  lastSeenIp:       inet("last_seen_ip"),
});

export type User          = typeof users.$inferSelect;
export type NewUser       = typeof users.$inferInsert;
export type UserRole      = "user" | "admin" | "superadmin";
export type UserStatus    = "active" | "suspended" | "pending_verification";
export type UserTier      = "free" | "standard" | "premium";
