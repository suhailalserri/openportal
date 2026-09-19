"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps next-themes. attribute="class" toggles `.light`/`.dark` on
 * <html> (theme.css defines both). Kept as its own file (rather than
 * inlined in layout.tsx) so it's independently testable/reusable per
 * the plan's providers/ split.
 */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
