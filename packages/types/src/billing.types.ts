export interface BalanceInfo {
  credits:       number; // micro-credits
  displayCredits: number; // human-readable credits
  totalSpent:    number;
  totalRedeemed: number;
}

export interface RedeemResult {
  success:        boolean;
  creditsAdded?:  number;
  error?:         RedeemError;
  message:        string;
}

export type RedeemError =
  | "INVALID_FORMAT"
  | "NOT_FOUND"
  | "ALREADY_USED"
  | "EXPIRED"
  | "REVOKED"
  | "TOO_MANY_ATTEMPTS"
  | "DAILY_LIMIT_REACHED"
  | "GENERIC";

export interface DeductResult {
  success:    boolean;
  newBalance: number;
  reason?:    string;
}

export interface CreditPackage {
  id:           string;
  label:        string;  // "50 SAR"
  labelAr:      string;  // "50 ريال"
  price:        number;  // in local currency units
  currency:     string;  // "SAR"
  microCredits: number;
  bonusPercent: number;  // bonus on top
}

// ── Payment methods phase (Yemen market) ───────────────────────────────
// See docs/PAYMENT_METHODS_PLAN.md. Runtime DB row shapes are the source
// of truth (packages/db's `creditPackages` / `paymentMethods` / etc. —
// import their $inferSelect types directly where the full row is needed).
// The types below are API-shape helpers for results that aren't just a
// DB row.

export interface ManualPaymentSubmitResult {
  success:       boolean;
  referenceCode?: string;
  claimId?:       string;
  message:        string;
  error?:         "PACKAGE_NOT_FOUND" | "PAYMENT_METHOD_NOT_FOUND" | "PAYMENT_METHOD_INACTIVE" | "GENERIC";
}

export interface ManualPaymentReviewResult {
  success: boolean;
  message: string;
}
