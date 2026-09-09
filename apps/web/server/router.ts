/**
 * Re-export appRouter from the API package for use in Next.js tRPC handler.
 * The web app uses the same router — no duplication.
 */
export { appRouter } from "../../../apps/api/src/routers/index";
export type { AppRouter } from "../../../apps/api/src/routers/index";
