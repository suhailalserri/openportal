import type { ComponentType } from "react";

import { ProfileSection } from "./sections/profile";
import { SecuritySection } from "./sections/security";
import { PreferencesSection } from "./sections/preferences";
import { ApiAccessSection } from "./sections/api-access";
import { ReferralSection } from "./sections/referral";
import { DataPrivacySection } from "./sections/data-privacy";

/**
 * apps/web/features/settings/registry.ts (Phase 7.1)
 *
 * Same role as `config/nav.ts`: one list drives every consumer (desktop
 * Tabs, mobile Accordion in `index.tsx`) so a section is never rendered
 * in one layout and forgotten in the other. `visible: false` sections
 * are declared now with a placeholder so 7.2 only has to write the
 * section's component and flip the flag — not restructure this file
 * (same reasoning as 6.1 pre-declaring the `usage` nav entry disabled).
 *
 * No hooks here (pure module, relative imports only) so `registry.test.ts`
 * can load it directly, same pattern as `config/nav.test.ts`.
 */

export interface SettingsSectionDef {
  id: string;
  /** Key in the `settings.nav` message namespace. */
  titleKey: string;
  component: ComponentType | null;
  visible: boolean;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  // 7.1 — landed
  { id: "profile", titleKey: "profile", component: ProfileSection, visible: true },
  { id: "security", titleKey: "security", component: SecuritySection, visible: true },
  // 7.2 — landed
  { id: "preferences", titleKey: "preferences", component: PreferencesSection, visible: true },
  { id: "apiAccess", titleKey: "apiAccess", component: ApiAccessSection, visible: true },
  { id: "referral", titleKey: "referral", component: ReferralSection, visible: true },
  { id: "data", titleKey: "data", component: DataPrivacySection, visible: true },
];

export function getVisibleSections(): SettingsSectionDef[] {
  return SETTINGS_SECTIONS.filter((s) => s.visible);
}
