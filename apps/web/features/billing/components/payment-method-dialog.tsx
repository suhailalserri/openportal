"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { formatYer } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentMethodLogo } from "./payment-method-logo";
import { useManualPayment } from "../hooks/use-manual-payment";
import { buildManualPaymentInput } from "../lib/manual-payment-input";
import type { CreditPackageRow, PaymentMethodRow } from "../types";

/**
 * apps/web/features/billing/components/payment-method-dialog.tsx (Phase 5.2)
 *
 * Fork point per the approved phase summary: `paymentMethodTypeEnum` has
 * exactly two real values.
 *  - `jaib_voucher`  → Jaib buys a pre-issued redeem *code* out-of-band;
 *    this dialog only shows the buyer the numbered instructions + the
 *    method's `accountCode`, then hands off to the existing 5.1 redeem
 *    box via `onGoToRedeem` (switches the parent Tabs to "Redeem" —
 *    index.tsx owns that state, not this dialog).
 *  - `manual_transfer` → the claim form (`submittedTxRef`, `senderPhone`,
 *    `senderName`, `notes`), submitted via `useManualPayment()`. On
 *    success shows the server-generated `referenceCode` prominently —
 *    this is what the buyer must write as their transfer memo, per
 *    `submitManualPayment`'s own doc comment.
 *
 * `submitManualPayment` hard-rejects any method that isn't
 * `manual_transfer` server-side, so a wrong client-side fork here is a
 * confusing-UI bug at worst, never a money bug (per the approved
 * summary's §4).
 */
export function PaymentMethodDialog({
  pkg,
  open,
  onOpenChange,
  onGoToRedeem,
}: {
  pkg: CreditPackageRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToRedeem: () => void;
}) {
  const t = useTranslations("billing.methods");
  const locale = useLocale() as "ar" | "en";
  const { data: methods, isPending } = trpc.billing.listPaymentMethods.useQuery();
  const [selected, setSelected] = useState<PaymentMethodRow | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) setSelected(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          {pkg ? (
            <DialogDescription>
              {(locale === "ar" ? pkg.nameAr : pkg.name)} · {formatYer(pkg.priceYer, locale)} {t("yer")}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : !selected ? (
          <div className="flex flex-col gap-2">
            {(methods ?? []).map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelected(method as PaymentMethodRow)}
                className="flex items-center gap-3 rounded-[10px] border border-border p-3 text-start hover:bg-secondary"
              >
                <PaymentMethodLogo logoUrl={method.logoUrl} name={method.name} />
                <span className="font-medium text-foreground">
                  {locale === "ar" ? method.nameAr : method.name}
                </span>
              </button>
            ))}
          </div>
        ) : selected.type === "jaib_voucher" ? (
          <JaibPanel method={selected} onGoToRedeem={() => { handleOpenChange(false); onGoToRedeem(); }} />
        ) : (
          <ManualTransferPanel
            pkg={pkg}
            method={selected}
            onDone={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function JaibPanel({ method, onGoToRedeem }: { method: PaymentMethodRow; onGoToRedeem: () => void }) {
  const t = useTranslations("billing.methods");
  const locale = useLocale() as "ar" | "en";
  const instructions = locale === "ar" ? method.instructionsAr : method.instructions;

  return (
    <div className="flex flex-col gap-4">
      {method.accountCode ? (
        <div className="flex items-center justify-between rounded-[10px] bg-secondary p-3">
          <span className="text-sm text-muted-foreground">{t("accountCode")}</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">{method.accountCode}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("copy")}
              onClick={() => {
                navigator.clipboard?.writeText(method.accountCode!);
                toast.success(t("copied"));
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {instructions ? (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{instructions}</p>
      ) : null}

      <DialogFooter>
        <Button type="button" onClick={onGoToRedeem}>
          {t("goToRedeem")}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ManualTransferPanel({
  pkg,
  method,
  onDone,
}: {
  pkg: CreditPackageRow | null;
  method: PaymentMethodRow;
  onDone: () => void;
}) {
  const t = useTranslations("billing.methods");
  const locale = useLocale() as "ar" | "en";
  const { submit, isPending, lastReferenceCode } = useManualPayment();
  const [submittedTxRef, setSubmittedTxRef] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderName, setSenderName] = useState("");
  const [notes, setNotes] = useState("");

  if (lastReferenceCode) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("claimSubmitted")}</p>
        <div className="rounded-[10px] bg-secondary px-4 py-3">
          <p className="text-xs text-muted-foreground">{t("referenceCodeLabel")}</p>
          <p className="font-mono text-lg font-semibold tracking-wide">{lastReferenceCode}</p>
        </div>
        <p className="text-xs text-muted-foreground">{t("referenceCodeHint")}</p>
        <Button type="button" onClick={onDone} className="mt-2">
          {t("done")}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!pkg) return;
        await submit(
          buildManualPaymentInput({
            packageId: pkg.id,
            paymentMethodId: method.id,
            submittedTxRef,
            senderPhone,
            senderName,
            notes,
          })
        ).catch(() => {
          // onError toast already shown by the hook; nothing else to do here.
        });
      }}
    >
      {method.instructionsAr || method.instructions ? (
        <p className="whitespace-pre-line text-sm text-muted-foreground">
          {locale === "ar" ? method.instructionsAr : method.instructions}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="senderName">{t("senderName")}</Label>
        <Input id="senderName" value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={100} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="senderPhone">{t("senderPhone")}</Label>
        <Input id="senderPhone" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} maxLength={30} dir="ltr" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="submittedTxRef">{t("submittedTxRef")}</Label>
        <Input id="submittedTxRef" value={submittedTxRef} onChange={(e) => setSubmittedTxRef(e.target.value)} maxLength={150} dir="ltr" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("submitting") : t("submitClaim")}
        </Button>
      </DialogFooter>
    </form>
  );
}
