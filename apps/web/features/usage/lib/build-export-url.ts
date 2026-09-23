import type { UsageLogFilters } from "../hooks/use-usage-log";

/**
 * apps/web/features/usage/lib/build-export-url.ts (Phase 6.2)
 *
 * Builds the query string for `GET /api/usage/export` (B2, frozen route
 * — not touched by this phase) from the same filter state the table is
 * currently rendering with. The plan's "Done when" for 6.2 is literally
 * "filtered CSV matches the on-screen rows" — this function is what
 * guarantees the download link and the table query can never drift
 * apart, since both read from the same `UsageLogFilters` object.
 *
 * Pure and framework-free on purpose (no next/navigation, no trpc) so it
 * can be unit-tested directly (build-export-url.test.ts) without a React
 * Testing Library / DOM harness.
 */
export function buildExportUrl(filters: UsageLogFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.modelId) params.set("modelId", filters.modelId);
  const qs = params.toString();
  return qs ? `/api/usage/export?${qs}` : "/api/usage/export";
}
