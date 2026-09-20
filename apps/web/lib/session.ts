/**
 * Server-side session + request-path helpers for the (app) / (admin)
 * layouts (Phase 2.1). NEW file — lib/auth.ts itself is frozen and only
 * imported here.
 *
 * Server components only: `headers()` throws outside a request scope,
 * and importing ./auth pulls in the database client.
 */
import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "./auth";
import { REQUEST_PATH_HEADER } from "./request-path";

/**
 * Wrapped in React `cache` so the (app)/(admin) layout and any page or
 * layout beneath it that needs the session share one lookup per request
 * instead of each calling better-auth again.
 */
export const getServerSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/**
 * Path + query of the current request, as forwarded by middleware.ts
 * (see lib/request-path.ts). null when the header is absent — callers
 * must then redirect without `?next=`. Untrusted: pass it through
 * sanitizeNext() (buildLoginRedirect does) before using it.
 */
export async function getRequestPath(): Promise<string | null> {
  return (await headers()).get(REQUEST_PATH_HEADER);
}
