"use client";

import { useSyncExternalStore } from "react";

/**
 * apps/web/lib/onboarding-gate.ts
 *
 * Tiny module-level gate so the welcome-bonus card appears strictly AFTER
 * the passkey ("security") offer has been dealt with, never on top of it.
 *
 * PasskeyOfferDialog calls `settlePasskeyOffer()` once it is finished with
 * the visitor — either it decided not to show at all (passkeys disabled or
 * unsupported, account not new, already answered, already has a passkey,
 * backend unavailable) or the card was closed / completed. The welcome
 * dialog waits for `usePasskeyOfferSettled()` to turn true.
 *
 * Module state (not React state) because the two dialogs are siblings in
 * the (app) layout with no shared parent state, and it must survive
 * client-side navigation. Resets naturally on a full page load, which is
 * fine: each dialog also has its own per-browser "already answered" flag.
 */
let settled = false;
const listeners = new Set<() => void>();

export function settlePasskeyOffer(): void {
  if (settled) return;
  settled = true;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePasskeyOfferSettled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => settled,
    () => false,
  );
}

/** Test-only reset. */
export function __resetOnboardingGateForTests(): void {
  settled = false;
  listeners.clear();
}
