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

  const body    = await req.json() as unknown;
  const apiUrl  = process.env.INTERNAL_API_URL ?? "http://api:4000";

  const upstream = await fetch(`${apiUrl}/chat`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ""}`,
      "X-User-ID":     session.user.id,
      "X-User-Email":  session.user.email,
    },
    body: JSON.stringify(body),
  });

  // Stream the response back
  return new Response(upstream.body, {
    status:  upstream.status,
    headers: {
      "Content-Type":    upstream.headers.get("Content-Type") ?? "text/event-stream",
      "Cache-Control":   "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
