"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { formatCredits } from "@/lib/format";
import { fireRedeemSideCannons } from "@/components/magicui/confetti";
import { toRedeemErrorCode, type RedeemApiResult } from "../types";

/**
 * apps/web/features/billing/hooks/use-redeem.ts (Phase 5.1)
 *
 * Talks to the LIVE redeem path, `POST /api/redeem` (F7 — the frozen
 * route already has Turnstile + rate limiting in front of the frozen
 * `redeemCode()` service). This hook owns none of that server logic; it
 * only: submits, maps the response to a translated message, invalidates
 * `billing.getBalance` so `BalanceCard`/`BalanceWidget` refresh without a
 * reload, and fires the confetti + success toast exactly once per
 * successful submit (never on error, never twice for one submit — a
 * `useRef` flag guards this independent of `confetti.tsx`'s own
 * module-level overlap guard, which only prevents two *animations*
 * overlapping, not two toasts/invalidations firing).
 */

type Locale = "ar" | "en";

interface UseRedeemResult {
  /** Resolves to true only on a confirmed successful redeem. */
  submit: (code: string, turnstileToken: string | null) => Promise<boolean>;
  isPending: boolean;
  /** Translated message from the last failed attempt, or null. Cleared on next submit. */
  errorMessage: string | null;
}

export function useRedeem(locale: Locale): UseRedeemResult {
  const t = useTranslations("redeem");
  const utils = trpc.useUtils();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const firedRef = useRef(false);

  const submit = useCallback(
    async (code: string, turnstileToken: string | null): Promise<boolean> => {
      if (isPending) return false; // no double-submit while a request is in flight
      firedRef.current = false;
      setErrorMessage(null);
      setIsPending(true);

      try {
        const response = await fetch("/api/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, turnstileToken: turnstileToken ?? undefined }),
        });

        // The route always returns 200 with { success: boolean, ... } for
        // handled cases (F7's contract) — a non-2xx here means something
        // unhandled (network edge, 401 session expiry, etc.), not a
        // redeem-specific error code.
        if (!response.ok) {
          setErrorMessage(t("errors.GENERIC"));
          toast.error(t("errors.GENERIC"));
          return false;
        }

        const result = (await response.json()) as RedeemApiResult;

        if (result.success) {
          const amount = formatCredits(result.creditsAdded ?? 0, locale);
          toast.success(t("success", { amount }));
          if (!firedRef.current) {
            firedRef.current = true;
            fireRedeemSideCannons();
          }
          await utils.billing.getBalance.invalidate();
          return true;
        }

        const errorCode = toRedeemErrorCode(result.error);
        const message = t(`errors.${errorCode}`);
        setErrorMessage(message);
        toast.error(message);
        return false;
      } catch {
        const message = t("errors.GENERIC");
        setErrorMessage(message);
        toast.error(message);
        return false;
      } finally {
        setIsPending(false);
      }
    },
    [isPending, locale, t, utils]
  );

  return { submit, isPending, errorMessage };
}
