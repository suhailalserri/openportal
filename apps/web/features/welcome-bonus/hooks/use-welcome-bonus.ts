"use client";

import { useCallback, useRef, useState } from "react";

import { trpc } from "@/lib/trpc";
import { fireRedeemSideCannons } from "@/components/magicui/confetti";

/**
 * apps/web/features/welcome-bonus/hooks/use-welcome-bonus.ts
 *
 * One hook for both claim surfaces (the floating card after sign-up and the
 * button on the billing page). The server is the ONLY authority on
 * "can this user claim" and enforces once-only with an atomic conditional
 * UPDATE (welcome-bonus.service.ts); this hook just:
 *   - exposes the server's `eligible` / amount,
 *   - blocks a second in-flight click locally (a UX nicety — not the guard),
 *   - fires the confetti exactly once per confirmed claim,
 *   - refreshes balance / history / eligibility so every surface updates.
 */

export type ClaimOutcome =
  | { ok: true; amountMicroCredits: number }
  | { ok: false; code: string };

const KNOWN_CODES = new Set([
  "ALREADY_CLAIMED", "DISABLED", "NOT_ELIGIBLE", "ACCOUNT_RESTRICTED", "TOO_MANY_REQUESTS",
]);

/** tRPC error → stable code the `welcomeBonus.errors.*` messages are keyed by. */
export function toClaimErrorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (KNOWN_CODES.has(message)) return message;
  const trpcCode = (err as { data?: { code?: string } } | null)?.data?.code;
  if (trpcCode === "TOO_MANY_REQUESTS") return "TOO_MANY_REQUESTS";
  return "generic";
}

export function useWelcomeBonus() {
  const utils = trpc.useUtils();
  const query = trpc.user.getWelcomeBonus.useQuery(undefined, { staleTime: 30_000 });
  const mutation = trpc.user.claimWelcomeBonus.useMutation();
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const claim = useCallback(async (): Promise<ClaimOutcome> => {
    if (inFlight.current) return { ok: false, code: "generic" };
    inFlight.current = true;
    setError(null);
    try {
      const res = await mutation.mutateAsync();
      fireRedeemSideCannons();
      await Promise.all([
        utils.user.getWelcomeBonus.invalidate(),
        utils.billing.invalidate(),
      ]);
      return { ok: true, amountMicroCredits: res.amountMicroCredits };
    } catch (err) {
      const code = toClaimErrorCode(err);
      setError(code);
      // Someone else (another tab/device) already claimed — resync so the
      // claim surfaces disappear instead of staying clickable.
      if (code === "ALREADY_CLAIMED" || code === "DISABLED" || code === "NOT_ELIGIBLE") {
        await utils.user.getWelcomeBonus.invalidate();
      }
      return { ok: false, code };
    } finally {
      inFlight.current = false;
    }
  }, [mutation, utils]);

  return {
    isLoading: query.isLoading,
    eligible: query.data?.eligible === true,
    amountMicroCredits: query.data?.amountMicroCredits ?? 0,
    claim,
    isClaiming: mutation.isPending,
    error,
    clearError: () => setError(null),
  };
}
