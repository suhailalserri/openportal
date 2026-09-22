import { BillingView } from "@/features/billing";

/**
 * apps/web/app/[locale]/(app)/billing/page.tsx (Phase 5.1)
 *
 * No server data fetch of its own — `(app)/layout.tsx` already ran the
 * session guard (Rule 4), and `BillingView`'s data (`billing.getBalance`)
 * is client-fetched via tRPC/React Query, same pattern as `chat/page.tsx`.
 */
export default function BillingPage() {
  return <BillingView />;
}
