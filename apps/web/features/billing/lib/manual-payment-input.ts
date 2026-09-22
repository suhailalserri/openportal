import type { ManualPaymentSubmitInput } from "../types";

/**
 * apps/web/features/billing/lib/manual-payment-input.ts (Phase 5.2 patch)
 *
 * Fixes a real `web:type-check` CI failure: this repo's tsconfig has
 * `exactOptionalPropertyTypes: true` (Vercel build log, `tsc`), which
 * means an optional property (`submittedTxRef?: string`) may be
 * *omitted* but never explicitly set to `undefined` — `{ foo: undefined }`
 * is a type error, only `{}` (key absent) satisfies `foo?: string`. The
 * original code did `submittedTxRef: submittedTxRef.trim() || undefined`,
 * which assigns `undefined` rather than omitting the key, and failed
 * exactly this check.
 *
 * This builder only adds a key when the trimmed value is non-empty, so
 * the returned object structurally satisfies `ManualPaymentSubmitInput`
 * (and the server's identical-shape `submitManualPayment` input) either
 * way — required fields are always present, optional ones are present
 * only when the buyer actually typed something.
 */
export function buildManualPaymentInput(fields: {
  packageId: string;
  paymentMethodId: string;
  submittedTxRef: string;
  senderPhone: string;
  senderName: string;
  notes: string;
}): ManualPaymentSubmitInput {
  const input: ManualPaymentSubmitInput = {
    packageId: fields.packageId,
    paymentMethodId: fields.paymentMethodId,
  };

  const submittedTxRef = fields.submittedTxRef.trim();
  if (submittedTxRef) input.submittedTxRef = submittedTxRef;

  const senderPhone = fields.senderPhone.trim();
  if (senderPhone) input.senderPhone = senderPhone;

  const senderName = fields.senderName.trim();
  if (senderName) input.senderName = senderName;

  const notes = fields.notes.trim();
  if (notes) input.notes = notes;

  return input;
}
