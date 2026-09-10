/**
 * Re-export appRouter from the API package for use in Next.js tRPC handler.
 * The web app uses the same router — no duplication.
 */
export { appRouter } from "@ai-platform/api/routers";
export type { AppRouter } from "@ai-platform/api/routers";
