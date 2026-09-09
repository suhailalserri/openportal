export const APP_NAME    = process.env.NEXT_PUBLIC_APP_NAME    ?? "AI Platform";
export const APP_NAME_AR = process.env.NEXT_PUBLIC_APP_NAME_AR ?? "منصة الذكاء";

export const MICRO_CREDIT = 1_000_000; // 1 credit = 1,000,000 micro-credits

/** Fraud thresholds */
export const FRAUD = {
  MAX_REQUESTS_PER_MINUTE:  20,
  MAX_REQUESTS_PER_HOUR:    500,
  REDEEM_ATTEMPTS_PER_HOUR: 5,
  REDEEM_ATTEMPTS_PER_DAY:  20,
  MAX_IPS_PER_USER_PER_DAY: 5,
  MAX_USERS_PER_IP_PER_DAY: 3,
  MAX_CREDITS_PER_HOUR:     1000,   // In display credits
  MAX_CONCURRENT_SESSIONS:  3,
  SENSITIVE_ACTION_PER_HOUR: 10, // changePassword / generateApiKey attempts per user
} as const;

/** Credit packages for direct payment */
export const CREDIT_PACKAGES = {
  "pkg_10sar":  { id: "pkg_10sar",  label: "10 SAR",  labelAr: "10 ريال",  price: 10,  currency: "SAR", microCredits: 500  * 1_000_000, bonusPercent: 0  },
  "pkg_25sar":  { id: "pkg_25sar",  label: "25 SAR",  labelAr: "25 ريال",  price: 25,  currency: "SAR", microCredits: 1350 * 1_000_000, bonusPercent: 8  },
  "pkg_50sar":  { id: "pkg_50sar",  label: "50 SAR",  labelAr: "50 ريال",  price: 50,  currency: "SAR", microCredits: 2800 * 1_000_000, bonusPercent: 12 },
  "pkg_100sar": { id: "pkg_100sar", label: "100 SAR", labelAr: "100 ريال", price: 100, currency: "SAR", microCredits: 6000 * 1_000_000, bonusPercent: 20 },
} as const;

/** Low balance warning threshold (in display credits) */
export const LOW_BALANCE_THRESHOLD = 10 * MICRO_CREDIT;

/** Supported locales */
export const SUPPORTED_LOCALES = ["ar", "en"] as const;
export const DEFAULT_LOCALE    = "ar" as const;
