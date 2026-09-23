/**
 * apps/web/components/shared/confirm-gate.ts (Phase 8b CI green-up)
 *
 * The confirm button's disabled rule, extracted from ConfirmDialog as a
 * pure function so the money/destructive gate is unit-testable. Blocked
 * when: an action is in flight; the caller says the form is not ready
 * (`confirmDisabled`); or a typed confirmation is required and the typed
 * text is not an EXACT (case-sensitive) match.
 */
export interface ConfirmGateInput {
  isPending: boolean;
  confirmDisabled: boolean;
  requireTypedConfirmation: { targetText: string } | undefined;
  typedText: string;
}

export function isConfirmBlocked({
  isPending,
  confirmDisabled,
  requireTypedConfirmation,
  typedText,
}: ConfirmGateInput): boolean {
  if (isPending || confirmDisabled) return true;
  if (requireTypedConfirmation && typedText !== requireTypedConfirmation.targetText) return true;
  return false;
}
