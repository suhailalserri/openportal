import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@ai-platform/api/routers";

/**
 * apps/web/features/admin/packages/types.ts (Phase 8b CI green-up)
 *
 * A package row AS THE CLIENT RECEIVES IT. `CreditPackage` from
 * `@ai-platform/db` types `createdAt`/`updatedAt` as `Date`, but tRPC
 * (no transformer configured) delivers them as ISO strings, so using the
 * db type here was a TS2345 error. Same inferRouterOutputs pattern as
 * `features/dashboard/types.ts`.
 */
export type PackageRow = inferRouterOutputs<AppRouter>["admin"]["listPackages"][number];
