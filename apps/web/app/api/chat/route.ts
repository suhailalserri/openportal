import { NextRequest } from "next/server";
import { auth }        from "@/lib/auth";
import { headers }     from "next/headers";

/**
 * Chat streaming endpoint — proxies to the Node.js API service.
 * The API service handles: auth, balance check, fraud check, streaming, billing.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body   = await req.json() as unknown;
  const apiUrl = process.env.INTERNAL_API_URL;

  // Fail loudly instead of silently defaulting to a Docker-internal
  // hostname ("api:4000") that only resolves inside docker-compose and
  // will never be reachable from a serverless/Vercel deployment.
  if (!apiUrl) {
    return new Response(
      JSON.stringify({
        error:   "CONFIG_ERROR",
        message: "INTERNAL_API_URL is not set. Point it at your deployed Fastify API service's public URL (e.g. https://api.yourdomain.com), not the docker-compose hostname.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/chat`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ""}`,
        "X-User-ID":     session.user.id,
        "X-User-Email":  session.user.email,
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(125_000), // slightly above the API's own 120s stream timeout
    });
  } catch (err) {
    console.error("chat proxy: failed to reach INTERNAL_API_URL", apiUrl, err);
    return new Response(
      JSON.stringify({
        error:   "UPSTREAM_UNREACHABLE",
        message: `Could not reach the API service at ${apiUrl}. Confirm it's deployed, running, and that this URL is reachable from where this app is hosted.`,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Surface a clear message if the upstream matched the wrong route
  // (e.g. INTERNAL_API_URL pointing at the wrong host/path) instead of
  // silently forwarding a bare 404 with no explanation.
  if (upstream.status === 404) {
    console.error("chat proxy: upstream returned 404 for", `${apiUrl}/chat`);
    return new Response(
      JSON.stringify({
        error:   "UPSTREAM_ROUTE_NOT_FOUND",
        message: `${apiUrl}/chat returned 404. INTERNAL_API_URL is likely misconfigured — it should be the base URL of your Fastify API service (the one exposing POST /chat), not this web app's own URL.`,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Stream the response back
  return new Response(upstream.body, {
    status:  upstream.status,
    headers: {
      "Content-Type":      upstream.headers.get("Content-Type") ?? "text/event-stream",
      "Cache-Control":     "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
