import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@ai-platform/api/routers";

/**
 * apps/web/features/usage/types.ts (Phase 6.2)
 *
 * Same local-scoping decision as `features/dashboard/types.ts` (6.1): no
 * shared `RouterOutputs` helper exists in the frozen `lib/trpc.ts`, so
 * this is duplicated here rather than touching the frozen zone. Both
 * copies infer from the same `AppRouter` — there is nothing to keep in
 * sync by hand, `tsc` does it.
 */
type RouterOutputs = inferRouterOutputs<AppRouter>;

export type UsageListPage = RouterOutputs["billing"]["listUsage"];
export type UsageListItem = UsageListPage["items"][number];
