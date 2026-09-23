import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@ai-platform/api/routers";

/**
 * apps/web/features/dashboard/types.ts (Phase 6.1)
 *
 * No shared `RouterOutputs` helper exists in the repo yet (checked before
 * writing this), so this is scoped locally rather than adding one to the
 * frozen `lib/trpc.ts`. If a later phase wants this repo-wide, hoisting
 * this single line into `lib/` is a trivial follow-up — not done here to
 * avoid touching the frozen zone in this session.
 */
type RouterOutputs = inferRouterOutputs<AppRouter>;

export type UsageSummary = RouterOutputs["billing"]["usageSummary"];
export type UsageTimeseriesPoint = RouterOutputs["billing"]["usageTimeseries"][number];
export type UsageByModelRow = RouterOutputs["billing"]["usageByModel"][number];
