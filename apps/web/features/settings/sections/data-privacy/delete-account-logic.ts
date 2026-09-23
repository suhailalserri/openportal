/**
 * apps/web/features/settings/sections/data-privacy/delete-account-logic.ts (Phase 7.2)
 *
 * Pure so it's unit-testable without a DOM (same pattern as
 * `../referral/lib.ts` and `features/chat/lib/chat-stream-reducer.ts`).
 * Extracted out of `delete-account-dialog.tsx` rather than left inline,
 * both to make it testable and to stop that component's local
 * `const code = ...` (the server's error code) from shadowing its
 * `code` state (the 2FA digits the visitor typed) — same value name,
 * two different things, previously disambiguated only by block scope.
 *
 * Mirrors `app/api/user/delete-account/route.ts`'s own check order
 * (password, then 2FA): the route never returns
 * `INVALID_TWO_FACTOR_CODE` from the password step (no code has been
 * sent yet to be invalid), only `TWO_FACTOR_REQUIRED` — the extra
 * `currentStep === "password"` branch below is defensive only, kept so
 * a future server change can't silently swallow the error instead of
 * advancing the dialog.
 */
export type DeleteAccountStep = "password" | "twoFactor";

export type DeleteAccountErrorCode =
  | "PASSWORD_REQUIRED"
  | "INCORRECT_PASSWORD"
  | "CONFIRMATION_REQUIRED"
  | "TWO_FACTOR_REQUIRED"
  | "INVALID_TWO_FACTOR_CODE"
  | "TOO_MANY_ATTEMPTS"
  | "GENERIC";

export interface DeleteAccountFailureResult {
  nextStep: DeleteAccountStep;
  /** Error to show on `nextStep`. Null means "advance with no message yet". */
  error: DeleteAccountErrorCode | null;
}

/** Given the dialog's current step and the server's error code for a failed
 *  submission, decide which step should be showing next and what error (if
 *  any) it should display. */
export function resolveDeleteAccountFailure(
  currentStep: DeleteAccountStep,
  errorCode: DeleteAccountErrorCode,
): DeleteAccountFailureResult {
  if (errorCode === "TWO_FACTOR_REQUIRED") {
    return { nextStep: "twoFactor", error: null };
  }
  if (errorCode === "INVALID_TWO_FACTOR_CODE" && currentStep === "password") {
    return { nextStep: "twoFactor", error: null };
  }
  return { nextStep: currentStep, error: errorCode };
}
