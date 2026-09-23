"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { PackagePicker } from "./package-picker";
import { PaymentMethodDialog } from "./payment-method-dialog";
import { MyClaimsList } from "./my-claims-list";
import { REDEEM_SECTION_ID } from "../index";
import type { CreditPackageRow } from "../types";

/**
 * apps/web/features/billing/components/buy-credits-section.tsx (Phase 5.2)
 *
 * Composes the package picker + method dialog + the buyer's own claim
 * list. Jaib's "go to redeem" hand-off is a scroll to the always-visible
 * 5.1 redeem box (`REDEEM_SECTION_ID`, exported from `index.tsx`), per
 * the approved phase summary — not a tab switch, since that box lives
 * above the tabs now, not inside one.
 */
export function BuyCreditsSection() {
  const t = useTranslations("billing");
  const [selectedPkg, setSelectedPkg] = useState<CreditPackageRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function scrollToRedeem() {
    document.getElementById(REDEEM_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t("packages.title")}</h3>
        <PackagePicker
          selectedId={selectedPkg?.id ?? null}
          onSelect={(pkg) => {
            setSelectedPkg(pkg);
            setDialogOpen(true);
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t("claims.title")}</h3>
        <MyClaimsList />
      </section>

      <PaymentMethodDialog
        pkg={selectedPkg}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGoToRedeem={scrollToRedeem}
      />
    </div>
  );
}
