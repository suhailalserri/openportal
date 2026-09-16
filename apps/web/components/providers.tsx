"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { trpc, getTRPCClient } from "@/lib/trpc";
import { ReferralCapture } from "@/components/referral/ReferralCapture";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient]  = useState(() => getTRPCClient());

  return (
    // `next-themes` was already a dependency but was never wired up —
    // app/[locale]/layout.tsx hardcoded `<html className="dark">`, so
    // there was no way to ever reach a light theme. attribute="class"
    // toggles `.light`/`.dark` on <html>; globals.css defines both.
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ReferralCapture />
          {children}
        </QueryClientProvider>
      </trpc.Provider>
    </ThemeProvider>
  );
}
