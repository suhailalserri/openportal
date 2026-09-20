"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, getTRPCClient } from "@/lib/trpc";
import { isUnauthorizedError } from "@/lib/trpc-error";

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
 *
 * Phase 2.2: `throwOnError: isUnauthorizedError` rethrows a
 * `protectedProcedure` 401 during render, which the nearest route-group
 * `error.tsx` (components/layout/route-error.tsx) catches and turns into
 * a "session expired, sign in again" screen — 2.1's known gap (a session
 * that expires while the tab stays open isn't caught until the next API
 * call). Narrow on purpose: only UNAUTHORIZED throws; every other tRPC
 * error (network blip, NOT_FOUND, BAD_REQUEST) stays in `query.error` so
 * the calling widget can show an inline retry instead of blanking the
 * whole route. `retry` mirrors the same narrowing — retrying a 401 up to
 * 3 times before it's rethrown would just add a few hundred ms of visible
 * delay to a failure that is never going to succeed on retry.
 */
export function TRPCQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            throwOnError: isUnauthorizedError,
            retry: (failureCount, error) => !isUnauthorizedError(error) && failureCount < 3,
          },
        },
      })
  );
  const [trpcClient] = useState(() => getTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
