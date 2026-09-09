import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum     = pgEnum("user_role",     ["user", "admin", "superadmin"]);
export const userStatusEnum   = pgEnum("user_status",   ["active", "suspended", "pending_verification"]);
export const userTierEnum     = pgEnum("user_tier",     ["free", "standard", "premium"]);
export const txTypeEnum       = pgEnum("tx_type",       ["redeem", "usage_debit", "admin_credit", "admin_debit", "refund", "payment", "referral_bonus"]);
export const codeStatusEnum   = pgEnum("code_status",   ["unused", "used", "expired", "revoked"]);
export const messageRoleEnum  = pgEnum("message_role",  ["user", "assistant", "system"]);
export const feedbackEnum     = pgEnum("feedback",      ["positive", "negative"]);
export const fraudTypeEnum    = pgEnum("fraud_type",    ["HIGH_REQUEST_VELOCITY", "MULTIPLE_IPS", "SHARED_IP_MULTI_ACCOUNT", "REDEEM_BRUTE_FORCE", "REDEEM_DAILY_LIMIT", "HIGH_SPEND_VELOCITY", "SUSPICIOUS_PATTERN"]);
export const fraudSeverityEnum= pgEnum("fraud_severity",["low", "medium", "high", "critical"]);
