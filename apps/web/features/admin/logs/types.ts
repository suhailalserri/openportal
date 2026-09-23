import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@ai-platform/api/routers";

/**
 * apps/web/features/admin/logs/types.ts (Phase 8c)
 *
 * Same local `inferRouterOutputs` pattern as `features/usage/types.ts` —
 * no shared `RouterOutputs` helper lives in the frozen `lib/trpc.ts`.
 */
type RouterOutputs = inferRouterOutputs<AppRouter>;

export type UsageLogPage = RouterOutputs["admin"]["listUsageLogs"];
export type UsageLogItem = UsageLogPage["items"][number];
