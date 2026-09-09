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
