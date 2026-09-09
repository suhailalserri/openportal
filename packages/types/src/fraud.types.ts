export type FraudSeverity = "low" | "medium" | "high" | "critical";
export type FraudType =
  | "HIGH_REQUEST_VELOCITY"
  | "MULTIPLE_IPS"
  | "SHARED_IP_MULTI_ACCOUNT"
  | "REDEEM_BRUTE_FORCE"
  | "REDEEM_DAILY_LIMIT"
  | "HIGH_SPEND_VELOCITY"
  | "SUSPICIOUS_PATTERN";

export interface FraudCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface FraudEventInput {
  userId:   string;
  type:     FraudType;
  severity: FraudSeverity;
  details?: Record<string, unknown>;
  ip?:      string;
  userAgent?: string;
}
