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

// ── Phase 5.2 — Payment methods (Yemen market: Jaib + manual transfer) ──
// Same reasoning as the header comment above: these mirror the real DB
// row shapes (packages/db/src/schema/{credit-packages,payment-methods,
// pending-manual-payments}.ts) and the tRPC procedure return shapes
// (apps/api/src/routers/billing.router.ts, frozen) field-for-field,
// rather than importing `AppRouter`'s inferred output types or any
// `@ai-platform/*` package type. 5.1 deliberately kept this feature
// folder's import surface at zero paths into the frozen zone, including
// type-only ones, for easier auditing — this phase keeps that policy
// rather than introducing a different pattern partway through the same
// feature folder. `trpc.billing.*.useQuery()`'s inferred data still
// structurally satisfies these interfaces (TypeScript structural typing
// checks this at every call site), so a real drift is still caught by
// `pnpm type-check` — duplication doesn't weaken that guarantee, it just
// means the fix-point on drift is "update this file" instead of
// "update an import."

export interface CreditPackageRow {
  id: string;
  name: string;
  nameAr: string;
  priceYer: number;
  credits: number; // micro-credits
  description: string | null;
  descriptionAr: string | null;
  isActive: boolean;
  sortOrder: number;
}

export type PaymentMethodType = "jaib_voucher" | "manual_transfer";

export interface PaymentMethodRow {
  id: string;
  name: string;
  nameAr: string;
  type: PaymentMethodType;
  logoUrl: string | null;
  accountCode: string | null;
  instructions: string | null;
  instructionsAr: string | null;
  isActive: boolean;
  sortOrder: number;
}

export type ManualPaymentStatus = "pending" | "approved" | "rejected";

export interface PendingManualPaymentRow {
  id: string;
  packageId: string;
  paymentMethodId: string;
  referenceCode: string;
  submittedTxRef: string | null;
  senderPhone: string | null;
  senderName: string | null;
  notes: string | null;
  status: ManualPaymentStatus;
  rejectionReason: string | null;
  createdAt: string; // serialized Date over the wire
}

export interface TransactionRow {
  id: string;
  type: string; // tx_type enum — widened, see lib/transaction-labels.ts
  amount: number; // micro-credits, signed
  balanceAfter: number;
  description: string | null;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export interface ManualPaymentSubmitInput {
  packageId: string;
  paymentMethodId: string;
  submittedTxRef?: string;
  senderPhone?: string;
  senderName?: string;
  notes?: string;
}

/** Server-shape mirror of `ManualPaymentSubmitResult` (`@ai-platform/types`, frozen source of truth). */
export interface ManualPaymentSubmitApiResult {
  success: boolean;
  referenceCode?: string;
  claimId?: string;
  message: string;
  error?: "PACKAGE_NOT_FOUND" | "PAYMENT_METHOD_NOT_FOUND" | "PAYMENT_METHOD_INACTIVE" | "GENERIC";
}
