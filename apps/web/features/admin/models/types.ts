import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@ai-platform/api/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type ModelRow = RouterOutputs["models"]["listAll"][number];
