"use client";

import { useTranslations } from "next-intl";

import { SectionPage } from "@/components/layout/section-page";
import { BalanceCard } from "./components/balance-card";
import { RedeemForm } from "./components/redeem-form";

/**
 * apps/web/features/billing/index.tsx (Phase 5.1)
 *
 * "Wallet + redeem" only — the buy-flow/package picker and transaction
 * history are 5.2 (plan §6, Phase 5.1 vs 5.2 split). `page.tsx` (the
 * route file) stays thin per Rule 4 and imports only this.
 */
export function BillingView() {
  const t = useTranslations("nav");

  return (
    <SectionPage title={t("billing")}>
      <div className="grid gap-6 md:grid-cols-2">
        <BalanceCard />
        <RedeemForm />
      </div>
    </SectionPage>
  );
}
