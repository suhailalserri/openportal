"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gift, Loader2 } from "lucide-react";

import { formatCredits } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWelcomeBonus } from "@/features/welcome-bonus/hooks/use-welcome-bonus";
import { PartyBurst } from "@/features/welcome-bonus/components/party-burst";

/**
 * apps/web/features/billing/components/welcome-bonus-card.tsx
 *
 * The fallback claim surface for a new user who closed / missed the floating
 * card. Renders NOTHING unless the server says the user can claim right now
 * (feature on, account eligible, not yet claimed), so it disappears for good
 * after a claim — from here, from the floating card, or from another device.
 *
 * After a successful claim the eligibility query flips to false, which would
 * unmount the card before the celebration is seen, so a local `celebrating`
 * state keeps it on screen (with the 🎉 animation) for a few seconds first.
 */
export function WelcomeBonusCard() {
  const t = useTranslations("welcomeBonus");
  const locale = useLocale() as "ar" | "en";
  const bonus = useWelcomeBonus();
  const [celebrating, setCelebrating] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState(0);

  useEffect(() => {
    if (!celebrating) return;
    const id = window.setTimeout(() => setCelebrating(false), 5000);
    return () => window.clearTimeout(id);
  }, [celebrating]);

  if (!celebrating && !bonus.eligible) return null;

  async function onClaim() {
    const outcome = await bonus.claim();
    if (outcome.ok) {
      setClaimedAmount(outcome.amountMicroCredits);
      setCelebrating(true);
    }
  }

  const amountLabel = formatCredits(celebrating ? claimedAmount : bonus.amountMicroCredits, locale);

  if (celebrating) {
    return (
      <Card>
        <CardContent className="grid gap-2 py-6 text-center">
          <PartyBurst />
          <p className="font-medium">{t("doneTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("doneMessage", { amount: amountLabel })}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {t("cardTitle")}
        </CardTitle>
        <CardDescription>{t("cardDescription", { amount: amountLabel })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {bonus.error ? (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${bonus.error}`)}
          </p>
        ) : null}
        <Button onClick={onClaim} disabled={bonus.isClaiming} aria-busy={bonus.isClaiming} className="w-full sm:w-auto">
          {bonus.isClaiming ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Gift className="size-4" aria-hidden="true" />
          )}
          {bonus.isClaiming ? t("claiming") : t("claim", { amount: amountLabel })}
        </Button>
      </CardContent>
    </Card>
  );
}
