"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  /** Disables the confirm button, shows a spinner-state label, while a mutation is in flight. */
  isPending?: boolean;
  destructive?: boolean;
  /**
   * "Type X to confirm" gate for money/destructive actions (8b: suspend
   * user, revoke a code batch, adjust credits). The confirm button stays
   * disabled until the input matches this exactly (case-sensitive) — no
   * partial-match leniency, since the whole point is deliberate friction
   * before an irreversible or financial action.
   */
  requireTypedConfirmation?: { targetText: string; label: string };
  errorMessage?: React.ReactNode;
}

/**
 * apps/web/components/shared/confirm-dialog.tsx (Phase 8a)
 *
 * Built on the plain `Dialog` primitive (not `alert-dialog.tsx`) to match
 * the one existing precedent for a destructive confirm flow in this
 * codebase — `delete-account-dialog.tsx` (7.2) — which is fully
 * controlled (`open`/`onOpenChange` from the caller, not
 * Radix-auto-close-on-click). That matters here specifically because a
 * money/destructive mutation can fail: an uncontrolled `AlertDialogAction`
 * closes on click regardless of the mutation's outcome, which would hide
 * the error. The caller decides when to close (typically: only after
 * `onConfirm` resolves without throwing).
 *
 * `isPending` disables BOTH buttons, not just confirm — cancelling out
 * from under an in-flight admin money mutation is exactly the kind of
 * "stale table, double-click" scenario Phase 8b's own "Breaks if wrong"
 * note warns about; this dialog closing early would let the caller
 * re-open it and fire a second one before the first's result is known.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  isPending = false,
  destructive = false,
  requireTypedConfirmation,
  errorMessage,
}: ConfirmDialogProps) {
  const [typedText, setTypedText] = useState("");

  useEffect(() => {
    if (!open) setTypedText("");
  }, [open]);

  const gatedButNotYetMatched = Boolean(requireTypedConfirmation) && typedText !== requireTypedConfirmation?.targetText;
  const confirmDisabled = isPending || gatedButNotYetMatched;

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {requireTypedConfirmation && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-dialog-typed-input">{requireTypedConfirmation.label}</Label>
            <Input
              id="confirm-dialog-typed-input"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              autoComplete="off"
              disabled={isPending}
            />
          </div>
        )}

        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={confirmDisabled}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
