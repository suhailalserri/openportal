/**
 * apps/web/features/billing/lib/transaction-labels.ts (Phase 5.2)
 *
 * Pure mapping from a `transactions.type` value (packages/db enums.ts
 * `txTypeEnum`, 8 values: redeem, usage_debit, admin_credit, admin_debit,
 * refund, payment, referral_bonus, welcome_bonus) to a `balance.types.*` i18n key and a
 * Badge tone. Kept as a standalone pure module (no React) so it's cheap
 * to unit test and reusable from both `transaction-history.tsx` and any
 * future admin table that renders the same enum.
 *
 * `messages/{ar,en}.json`'s `balance.types` had 6 of the 7 real enum
 * values — `refund` was missing (added in this phase, see the
 * BRANCH_AND_CI_NOTES.md entry for 5.2). `toTransactionLabelKey()` falls
 * back to a generic key rather than rendering a raw enum string if the
 * server ever adds an 8th value before the frontend catches up.
 */

export const KNOWN_TX_TYPES = [
  "redeem",
  "usage_debit",
  "admin_credit",
  "admin_debit",
  "refund",
  "payment",
  "referral_bonus",
  "welcome_bonus",
] as const;

export type KnownTxType = (typeof KNOWN_TX_TYPES)[number];

export type BadgeTone = "success" | "destructive" | "info" | "secondary" | "outline";

interface TxTypeMeta {
  /** Suffix under `balance.types.*` in messages/{ar,en}.json. */
  messageKey: KnownTxType | "unknown";
  tone: BadgeTone;
  /** true = credit (green-leaning), false = debit (neutral/destructive-leaning). */
  isCredit: boolean;
}

const TX_TYPE_META: Record<KnownTxType, TxTypeMeta> = {
  redeem:          { messageKey: "redeem",          tone: "success",     isCredit: true },
  payment:         { messageKey: "payment",         tone: "success",     isCredit: true },
  referral_bonus:  { messageKey: "referral_bonus",  tone: "success",     isCredit: true },
  welcome_bonus:   { messageKey: "welcome_bonus",   tone: "success",     isCredit: true },
  refund:          { messageKey: "refund",          tone: "info",        isCredit: true },
  admin_credit:    { messageKey: "admin_credit",    tone: "info",        isCredit: true },
  usage_debit:     { messageKey: "usage_debit",     tone: "secondary",   isCredit: false },
  admin_debit:     { messageKey: "admin_debit",     tone: "destructive", isCredit: false },
};

const UNKNOWN_META: TxTypeMeta = { messageKey: "unknown", tone: "outline", isCredit: false };

function isKnownTxType(type: string): type is KnownTxType {
  return (KNOWN_TX_TYPES as readonly string[]).includes(type);
}

/** Full metadata for a transaction type; safe on any string, including a future unmapped enum value. */
export function getTransactionTypeMeta(type: string): TxTypeMeta {
  return isKnownTxType(type) ? TX_TYPE_META[type] : UNKNOWN_META;
}

/** `balance.types.*` message key to look up via `t(\`types.${key}\`)`. Never throws, never returns a raw enum string. */
export function toTransactionLabelKey(type: string): string {
  return getTransactionTypeMeta(type).messageKey;
}
