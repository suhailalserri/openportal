import { router, createCallerFactory } from "./trpc";
import { billingRouter } from "./billing.router";
import { userRouter }    from "./user.router";
import { modelsRouter }  from "./models.router";
import { adminRouter }   from "./admin.router";
import { platformConfigRouter } from "./platform-config.router";

export const appRouter = router({
  billing:        billingRouter,
  user:           userRouter,
  models:         modelsRouter,
  admin:          adminRouter,
  platformConfig: platformConfigRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Additive (Phase 3.2 backend addition — see trpc.ts's own comment on
 * createCallerFactory for the full rationale). Re-exported here, next to
 * appRouter itself, so a consumer only needs one import path
 * ("@ai-platform/api/routers") to get everything needed to build a
 * server-side caller: `createCallerFactory(appRouter)(context)`.
 */
export { createCallerFactory };
export type { Context } from "./trpc";
