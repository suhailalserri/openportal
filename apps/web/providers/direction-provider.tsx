"use client";

import { DirectionProvider as RadixDirectionProvider } from "@radix-ui/react-direction";
import { useLocale } from "next-intl";

const RTL_LOCALES = new Set(["ar"]);

/**
 * Nothing wired RTL context for Radix before this file existed. Every
 * Radix primitive that cares about direction (arrow-key nav in
 * Tabs/DropdownMenu/Select, Sheet's slide side via useDirection() in
 * sheet.tsx) reads from this context rather than each component
 * re-deriving locale itself.
 */
export function AppDirectionProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";
  return <RadixDirectionProvider dir={dir}>{children}</RadixDirectionProvider>;
}
