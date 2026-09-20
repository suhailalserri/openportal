"use client";

import { registerClientCacheClearer } from "@/lib/client-cache";

/**
 * apps/web/features/consent/lib/consent-storage.ts
 *
 * Only essential cookies exist today (session cookie, better-auth) — no
 * analytics/marketing cookie is set anywhere in this repo (grepped: no
 * gtag/analytics/pixel import exists). So this banner has nothing to ask
 * consent *for* yet; it exists per plan 3.2 as "a minimal consent
 * banner... hook is ready for later analytics" — i.e. the dismissal
 * mechanism and copy slot are built now, so turning on a real analytics
 * script later is a copy change, not a new banner.
 *
 * The dismissal flag itself is the one new localStorage key. It's
 * per-user in the loose sense that Rule 9 cares about (a subsequent
 * visitor on a shared device shouldn't inherit "already dismissed" as if
 * they'd consented), so it's registered with clearAllClientCaches() —
 * the first real registrant of that registry (lib/client-cache.ts).
 */
const STORAGE_KEY = "op.consent.dismissedAt";

export function isConsentDismissed(): boolean {
  if (typeof window === "undefined") return true; // SSR: render nothing rather than flash
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // Storage unavailable (private-mode Safari, disabled storage) — fail
    // open (banner won't persist dismissal) rather than throwing.
    return false;
  }
}

export function dismissConsent(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    // Best-effort — nothing else to do if storage is unavailable.
  }
}

function clearConsentDismissal(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort, same as above.
  }
}

registerClientCacheClearer(clearConsentDismissal);
