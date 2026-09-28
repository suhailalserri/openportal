"use client";

import { useEffect, useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useSession } from "@/lib/auth-client";
import { formatCredits } from "@/lib/format";
import { usePasskeyOfferSettled } from "@/lib/onboarding-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWelcomeBonus } from "../hooks/use-welcome-bonus";
import { PartyBurst } from "./party-burst";

/**
 * One-time floating "claim your welcome gift" card for brand-new accounts,
 * mounted in the (app) layout right after <PasskeyOfferDialog />.
 *
 * Same shell, spacing and controls as the passkey card (Dialog max-w-sm,
 * round accent icon + Badge header, primary + outline buttons) so the two
 * feel like one onboarding sequence.
 *
 * Opens only when ALL of these hold:
 *   - the passkey offer is finished with the visitor (lib/onboarding-gate —
 *     it never stacks on top of the security card)
 *   - the server says this user is eligible right now (feature enabled,
 *     amount > 0, account is new + active, not already claimed)
 *   - the account is recent (NEW_ACCOUNT_WINDOW_MS, same window as the
 *     passkey card) and this browser hasn't already answered
 *
 * "Maybe later" / closing records the answer for this browser only; the
 * bonus is NOT forfeited — Billing shows a claim button for as long as the
 * server still says the user is eligible. Once-only is enforced by the
 * server, never by this component.
 */
const NEW_ACCOUNT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const storageKey = (userId: string) => `welcome-offer:${userId}`;

function hasAnswered(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function markAnswered(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // storage blocked — the card may reappear next visit, which is harmless
  }
}

type Phase = "offer" | "done";

export function WelcomeBonusDialog() {
  const t = useTranslations("welcomeBonus");
  const locale = useLocale() as "ar" | "en";
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const createdMs = session?.user?.createdAt ? new Date(session.user.createdAt).getTime() : null;

  const passkeySettled = usePasskeyOfferSettled();
  const bonus = useWelcomeBonus();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("offer");
  const [claimedAmount, setClaimedAmount] = useState(0);

  useEffect(() => {
    if (open || phase === "done") return;
    if (!passkeySettled || !userId || createdMs === null) return;
    if (Number.isNaN(createdMs) || Date.now() - createdMs > NEW_ACCOUNT_WINDOW_MS) return;
    if (!bonus.eligible || bonus.amountMicroCredits <= 0) return;
    if (hasAnswered(storageKey(userId))) return;
    setOpen(true);
  }, [passkeySettled, userId, createdMs, bonus.eligible, bonus.amountMicroCredits, open, phase]);

  function dismiss() {
    if (userId) markAnswered(storageKey(userId));
    setOpen(false);
  }

  async function onClaim() {
    const outcome = await bonus.claim();
    if (outcome.ok) {
      if (userId) markAnswered(storageKey(userId));
      setClaimedAmount(outcome.amountMicroCredits);
      setPhase("done");
    } else if (outcome.code === "ALREADY_CLAIMED" || outcome.code === "DISABLED" || outcome.code === "NOT_ELIGIBLE") {
      // Nothing left to offer — close it and remember, so it doesn't reopen.
      dismiss();
    }
  }

  function onOpenChange(next: boolean) {
    if (next) return;
    if (bonus.isClaiming) return; // don't abandon a claim mid-flight
    if (phase === "done") setOpen(false);
    else dismiss();
  }

  const amountLabel = formatCredits(phase === "done" ? claimedAmount : bonus.amountMicroCredits, locale);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {phase === "done" ? (
          <div className="grid gap-4 text-center">
            <PartyBurst />
            <DialogHeader className="items-center text-center">
              <DialogTitle>{t("doneTitle")}</DialogTitle>
              <DialogDescription>{t("doneMessage", { amount: amountLabel })}</DialogDescription>
            </DialogHeader>
            <Button onClick={() => setOpen(false)}>{t("done")}</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Gift className="size-4" aria-hidden="true" />
                </span>
                <Badge>{t("badge")}</Badge>
              </div>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("subtitle", { amount: amountLabel })}</DialogDescription>
            </DialogHeader>

            {bonus.error ? (
              <p role="alert" className="text-sm text-destructive">
                {t(`errors.${bonus.error}`)}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Button onClick={onClaim} disabled={bonus.isClaiming} aria-busy={bonus.isClaiming}>
                {bonus.isClaiming ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Gift className="size-4" aria-hidden="true" />
                )}
                {bonus.isClaiming ? t("claiming") : t("claim", { amount: amountLabel })}
              </Button>
              <Button variant="outline" onClick={dismiss} disabled={bonus.isClaiming}>
                {t("later")}
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">{t("explainer")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
