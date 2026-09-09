import { createTRPCReact }      from "@trpc/react-query";
import { httpBatchLink }        from "@trpc/client";
import type { AppRouter }       from "../../../apps/api/src/routers/index";

export const trpc = createTRPCReact<AppRouter>();

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url:         "/api/trpc",
        credentials: "include",
        headers: () => ({
          "x-trpc-source": "web",
        }),
      }),
    ],
  });
}
