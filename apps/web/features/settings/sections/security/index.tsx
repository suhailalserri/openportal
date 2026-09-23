"use client";

import { ChangePasswordForm } from "./change-password-form";
import { TwoFactorSection } from "./two-factor-section";
import { ActiveSessionsList } from "./active-sessions-list";

/**
 * apps/web/features/settings/sections/security/index.tsx (Phase 7.1)
 *
 * Three independent cards, each owning its own data-fetch/mutation
 * state — no shared form, no shared dirty-guard, so a saved password
 * change doesn't require also touching 2FA or session state and
 * vice versa.
 */
export function SecuritySection() {
  return (
    <div className="flex flex-col gap-4">
      <ChangePasswordForm />
      <TwoFactorSection />
      <ActiveSessionsList />
    </div>
  );
}
