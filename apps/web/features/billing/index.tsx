"use client";

import { useTranslations } from "next-intl";

import { SectionPage } from "@/components/layout/section-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BalanceCard } from "./components/balance-card";
import { RedeemForm } from "./components/redeem-form";
import { BuyCreditsSection } from "./components/buy-credits-section";
import { TransactionHistory } from "./components/transaction-history";
import { PricingTable } from "./components/pricing-table";

export const REDEEM_SECTION_ID = "billing-redeem-section";

/**
 * apps/web/features/billing/index.tsx (Phase 5.1 → edited in 5.2)
 *
 * 5.1 shipped "wallet + redeem" only, always visible at the top. 5.2
 * (plan §6, Phase 5.1 vs 5.2 split) adds the buy flow, transaction
 * history, and pricing table as `Tabs` below it, so the page doesn't
 * become one long scroll. `page.tsx` (the route file) is unchanged — it
 * already just renders `<BillingView />`.
 *
 * The 5.1 redeem box stays where it was rather than moving into a tab:
 * `BuyCreditsSection`'s Jaib panel scrolls to `#${REDEEM_SECTION_ID}`
 * (per the approved phase summary's "scroll to redeem CTA", not a tab
 * switch — Jaib buys a pre-issued code out-of-band, and the existing
 * redeem box already handles that, so it needs to stay reachable
 * regardless of which tab is open).
 */
export function BillingView() {
  const tNav = useTranslations("nav");
  const tBilling = useTranslations("billing");

  return (
    <SectionPage title={tNav("billing")}>
      <div className="flex flex-col gap-6">
        <div id={REDEEM_SECTION_ID} className="grid scroll-mt-20 gap-6 md:grid-cols-2">
          <BalanceCard />
          <RedeemForm />
        </div>

        <Tabs defaultValue="buy">
          <TabsList>
            <TabsTrigger value="buy">{tBilling("tabs.buy")}</TabsTrigger>
            <TabsTrigger value="pricing">{tBilling("tabs.pricing")}</TabsTrigger>
            <TabsTrigger value="history">{tBilling("tabs.history")}</TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="pt-4">
            <BuyCreditsSection />
          </TabsContent>

          <TabsContent value="pricing" className="pt-4">
            <PricingTable />
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            <TransactionHistory />
          </TabsContent>
        </Tabs>
      </div>
    </SectionPage>
  );
}
