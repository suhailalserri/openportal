import { SettingsView } from "@/features/settings";

/**
 * apps/web/app/[locale]/(app)/settings/page.tsx (Phase 7.1)
 *
 * No server data fetch of its own — `(app)/layout.tsx` already ran the
 * session guard (Rule 4), and every section's data is client-fetched
 * (tRPC for profile, authClient/REST for security), same pattern as
 * `usage/page.tsx` (6.2) and `dashboard/page.tsx` (6.1).
 */
export default function SettingsPage() {
  return <SettingsView />;
}
