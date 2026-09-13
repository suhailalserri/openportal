import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter }           from "@/server/router";
import { createContext }       from "@/server/context";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint:     "/api/trpc",
    req,
    router:       appRouter,
    createContext: () => createContext(req),
    onError: ({ error, path }) => {
      // Always log server-side. This used to be gated to non-production,
      // which meant every real error in prod (Vercel always sets
      // NODE_ENV=production) was completely invisible in Runtime Logs —
      // the exact mistake apps/api/src/index.ts's onError comment already
      // documents fixing for the Fastify path; this Next.js route handler
      // is a separate onError and had never gotten the same fix.
      console.error(`tRPC error on ${path}:`, error.message, error.stack);
    },
  });

export { handler as GET, handler as POST };
