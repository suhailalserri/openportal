"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { formatCredits } from "@/lib/format";
import { buildReferralLink } from "./lib";

/**
 * apps/web/features/settings/sections/referral/index.tsx (Phase 7.2)
 *
 * Rule text is deliberately "after your friend's first payment", not
 * "when they sign up" — ADR-009 (docs/architecture/decisions.md):
 * `maybeAwardReferralBonus()` only fires from inside `redeemCode()` /
 * `approveManualPayment()`, never the signup hook, specifically to
 * avoid a farm-N-throwaway-accounts abuse pattern. Getting this wrong
 * in the UI would set an expectation the backend never honors.
 */
export function ReferralSection() {
  const t = useTranslations("settings.referral");
  const locale = useLocale() as "ar" | "en";
  const { data, isLoading } = trpc.user.getReferralStats.useQuery();
  const [copied, setCopied] = useState(false);

  if (isLoading || !data) {
    return <Skeleton className="h-48 w-full rounded-[14px]" />;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = data.referralCode ? buildReferralLink(appUrl, data.referralCode, locale) : null;

  function copyLink() {
    if (!link) return;
    void navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("rules")}</p>

        {link ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly dir="ltr" value={link} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="sm" onClick={copyLink} className="shrink-0">
              {copied ? t("copied") : t("copy")}
            </Button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button
                type="button" variant="ghost" size="sm" className="shrink-0"
                onClick={() => void (navigator as Navigator & { share: (d: { url: string }) => Promise<void> }).share({ url: link })}
              >
                {t("share")}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("noCode")}</p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("referredCount")}</p>
            <p className="text-lg font-semibold text-foreground">{data.referredCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("bonusesAwarded")}</p>
            <p className="text-lg font-semibold text-foreground">{data.bonusesAwarded}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("totalEarned")}</p>
            <p className="text-lg font-semibold text-foreground">
              {formatCredits(data.totalBonusMicroCredits, locale)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
