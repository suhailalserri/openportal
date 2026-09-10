import { createTRPCReact }      from "@trpc/react-query";
import { httpBatchLink }        from "@trpc/client";
import type { AppRouter }       from "@ai-platform/api/routers";

export const trpc = createTRPCReact<AppRouter>();

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" } as RequestInit);
        },
        headers: () => ({
          "x-trpc-source": "web",
        }),
      }),
    ],
  });
}
