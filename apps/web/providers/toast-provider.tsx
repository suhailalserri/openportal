"use client";

import { Toaster } from "sonner";
import { useLocale } from "next-intl";

const RTL_LOCALES = new Set(["ar"]);

/**
 * Previously inlined in layout.tsx, pointed at --bg-surface/--text-primary
 * — tokens that don't exist in the new theme.css (Gateway uses
 * --popover/--popover-foreground/--border). Fixed here, and given its own
 * file per the plan's providers/ split.
 */
export function AppToastProvider() {
  const locale = useLocale();
  const isRTL = RTL_LOCALES.has(locale);

  return (
    <Toaster
      position={isRTL ? "bottom-left" : "bottom-right"}
      dir={isRTL ? "rtl" : "ltr"}
      toastOptions={{
        style: {
          background: "var(--popover)",
          color: "var(--popover-foreground)",
          border: "1px solid var(--border)",
        },
      }}
    />
  );
}
