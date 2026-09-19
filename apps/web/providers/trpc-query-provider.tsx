"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, getTRPCClient } from "@/lib/trpc";

/**
 * Carries over the working tRPC + React Query wiring from the deleted
 * components/providers.tsx, unchanged — lib/trpc.ts is frozen, so
 * getTRPCClient()'s implementation isn't touched here, just relocated.
 *
 * `<ReferralCapture />` (previously rendered here) is NOT carried over:
 * components/referral/** is on this phase's DELETE list. Referral capture
 * wiring comes back in the Phase 3.2 rebuild — dropping it silently would
 * be a regression, so flagging it: there is currently nowhere in the app
 * that reads a referral code from the URL.
 */
export function TRPCQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => getTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
