import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter }           from "@/server/router";
import { createContext }       from "@/server/context";
import { reportError }         from "@/lib/monitoring/report";

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

      // P2.1 (owner-approved frozen edit): tRPC catches handler errors and
      // returns them as JSON, so Next's `onRequestError` never sees them and
      // they were invisible to Sentry. Server faults only; expected codes
      // (UNAUTHORIZED, FORBIDDEN, BAD_REQUEST...) are not bugs. Report the
      // original error (`cause`) for the real stack. `path` is the procedure
      // name, never the input. reportError is a no-op without a DSN and
      // never throws.
      if (error.code === "INTERNAL_SERVER_ERROR") {
        reportError(error.cause instanceof Error ? error.cause : error, {
          source: "trpc-server",
          tags:   { procedure: path ?? "unknown" },
        });
      }
    },
  });

export { handler as GET, handler as POST };
