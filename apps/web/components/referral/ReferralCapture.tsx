"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "referral_code";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — covers "saw a link, signed up later"

/**
 * Captures `?ref=CODE` from the URL on whatever page it first appears on
 * and persists it, so attribution survives normal browsing before the
 * person actually registers (they might land on the homepage from a
 * shared link, poke around, and sign up a day later on a different page).
 * Read back via `getStoredReferralCode()` in the register page and sent
 * as the `x-referral-code` header — see auth.ts's
 * `databaseHooks.user.create.after`.
 *
 * Mounted once in <Providers> so it runs on every page without every
 * route needing to know about referrals.
 */
export function ReferralCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ code: ref.trim().toUpperCase(), savedAt: Date.now() })
      );
    } catch {
      // localStorage unavailable (private browsing, storage full, etc.)
      // — attribution is best-effort and never worth breaking a page over.
    }
  }, [searchParams]);

  return null;
}

export function getStoredReferralCode(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { code, savedAt } = JSON.parse(raw) as { code: string; savedAt: number };
    if (Date.now() - savedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}
