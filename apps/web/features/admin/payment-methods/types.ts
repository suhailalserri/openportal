import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@ai-platform/api/routers";

/**
 * apps/web/features/admin/payment-methods/types.ts (Phase 8b CI green-up)
 *
 * A payment-method row AS THE CLIENT RECEIVES IT (dates are ISO strings
 * over tRPC, not the `Date` that `PaymentMethod` from `@ai-platform/db`
 * declares). See ../packages/types.ts.
 */
export type PaymentMethodRow = inferRouterOutputs<AppRouter>["admin"]["listPaymentMethods"][number];
