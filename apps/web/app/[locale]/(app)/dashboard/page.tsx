import { DashboardView } from "@/features/dashboard";

/**
 * apps/web/app/[locale]/(app)/dashboard/page.tsx (Phase 6.1)
 *
 * No server data fetch of its own — `(app)/layout.tsx` already ran the
 * session guard (Rule 4), and `DashboardView`'s data (`billing.usage*`)
 * is client-fetched via tRPC/React Query, same pattern as
 * `billing/page.tsx` and `chat/page.tsx`.
 */
export default function DashboardPage() {
  return <DashboardView />;
}
