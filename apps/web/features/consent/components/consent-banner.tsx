"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { isConsentDismissed, dismissConsent } from "../lib/consent-storage";
import { Button } from "@/components/ui/button";

/**
 * apps/web/features/consent/components/consent-banner.tsx
 *
 * Client Component: needs localStorage + dismiss state, so it can't be a
 * Server Component like the rest of features/landing. Mounted from
 * features/landing/index.tsx.
 *
 * `mounted` guard (same pattern as components/layout/theme-toggle.tsx):
 * localStorage's value is only knowable after hydration, so the banner
 * always renders nothing on the server and the first client render,
 * avoiding a hydration mismatch — the alternative (guessing "not
 * dismissed" on the server) would flash the banner for a split second
 * on every repeat visitor.
 */
export function ConsentBanner({ locale }: { locale: string }) {
  const t = useTranslations("consent");
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setMounted(true);
    setDismissed(isConsentDismissed());
  }, []);

  if (!mounted || dismissed) return null;

  return (
    <div
      role="region"
      aria-label={t("bannerLabel")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-3 text-[12.5px] text-muted-foreground sm:flex-row sm:px-6">
        <p>
          {t("message")}{" "}
          <Link href={`/${locale}/legal/privacy`} className="text-primary hover:underline">
            {t("learnMore")}
          </Link>
        </p>
        <Button
          size="sm"
          onClick={() => {
            dismissConsent();
            setDismissed(true);
          }}
        >
          {t("accept")}
        </Button>
      </div>
    </div>
  );
}
