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
// pending   = discovered via gateway sync, not yet configured/priced by an admin, never shown to users
// published = admin has set display info + pricing; eligible to show when isAvailable = true
// disabled  = admin explicitly retired it (distinct from isAvailable=false, which sync also sets automatically)
export const modelStatusEnum  = pgEnum("model_status",  ["pending", "published", "disabled"]);
