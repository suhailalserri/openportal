/**
 * apps/web/features/billing/types.ts (Phase 5.1)
 *
 * Mirrors the JSON shape `POST /api/redeem` actually returns
 * (apps/web/app/api/redeem/route.ts → apps/api/src/services/redeem.service.ts
 * `RedeemResult`, frozen). Kept as a separate local type rather than
 * importing `RedeemResult` from `@ai-platform/types`, since that package
 * lives outside `apps/web` and is therefore frozen for this session too
 * (see redeem-shape.ts's header comment) — importing a *type* would be
 * safe (no edit), but duplicating the shape here means this feature
 * folder has no import path into the frozen zone at all, not even a
 * read-only one, which is easier to audit.
 */
export const REDEEM_ERROR_CODES = [
  "INVALID_FORMAT",
  "NOT_FOUND",
  "ALREADY_USED",
  "EXPIRED",
  "REVOKED",
  "TOO_MANY_ATTEMPTS",
  "DAILY_LIMIT_REACHED",
  "CAPTCHA_FAILED",
  "GENERIC",
] as const;

export type RedeemErrorCode = (typeof REDEEM_ERROR_CODES)[number];

export interface RedeemApiResult {
  success: boolean;
  message: string;
  error?: string;
  creditsAdded?: number;
}

/** Narrows an arbitrary server error string to a known i18n key, defaulting to GENERIC. */
export function toRedeemErrorCode(error: string | undefined): RedeemErrorCode {
  return (REDEEM_ERROR_CODES as readonly string[]).includes(error ?? "")
    ? (error as RedeemErrorCode)
    : "GENERIC";
}
