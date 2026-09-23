import { UsageLogView } from "@/features/usage";

/**
 * apps/web/app/[locale]/(app)/usage/page.tsx (Phase 6.2)
 *
 * No server data fetch of its own — `(app)/layout.tsx` already ran the
 * session guard (Rule 4), and `UsageLogView`'s data (`billing.listUsage`)
 * is client-fetched via tRPC/React Query, same pattern as
 * `dashboard/page.tsx` (6.1).
 */
export default function UsagePage() {
  return <UsageLogView />;
}
