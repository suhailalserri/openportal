import { router }        from "./trpc";
import { billingRouter } from "./billing.router";
import { userRouter }    from "./user.router";
import { modelsRouter }  from "./models.router";
import { adminRouter }   from "./admin.router";

export const appRouter = router({
  billing: billingRouter,
  user:    userRouter,
  models:  modelsRouter,
  admin:   adminRouter,
});

export type AppRouter = typeof appRouter;
