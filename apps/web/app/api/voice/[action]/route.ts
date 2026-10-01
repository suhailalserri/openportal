import { rejectUnusableAccount } from "@/lib/account-guard-server";
import { resolveWebClientIp } from "@ai-platform/api/utils/client-ip";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * P6.3b voice input bridge (owner-approved frozen-zone exception: NEW files only under app/api/voice/**).
 *
 * `voice.*` only works on the api host (the storage service key is Render-only), and the api's tRPC
 * context cannot be reached with the internal service token. So this proxy forwards to the api's
 * `/voice/*` routes (apps/api/src/services/voice-http.ts), authenticated exactly like `/api/chat`:
 * the web session is verified here, the api sees the internal token + X-User-ID. The browser never
 * holds an api credential, and the recording itself goes straight from the browser to the signed
 * storage URL, never through this route.
 *
 * Only a fixed list of actions is forwarded and only a JSON body of at most 8 KB; headers, query
 * strings and the upstream's own headers are never copied through.
 */
export const maxDuration = 60;

const GET_ACTIONS = new Set(["status"]);
const POST_ACTIONS = new Set(["upload-url", "confirm", "transcribe"]);
const MAX_BODY_BYTES = 8 * 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function forward(req: NextRequest, method: "GET" | "POST", action: string): Promise<Response> {
  const allowed = method === "GET" ? GET_ACTIONS : POST_ACTIONS;
  if (!allowed.has(action)) return json(404, { error: "NOT_FOUND", message: "NOT_FOUND" });

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return json(401, { error: "UNAUTHORIZED", message: "UNAUTHORIZED" });
  const lockedAccount = await rejectUnusableAccount(session.user.id);
  if (lockedAccount) return lockedAccount;

  let body: string | undefined;
  if (method === "POST") {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "PAYLOAD_TOO_LARGE", message: "PAYLOAD_TOO_LARGE" });
    try {
      JSON.parse(raw === "" ? "{}" : raw);
    } catch {
      return json(400, { error: "VALIDATION_ERROR", message: "VALIDATION_ERROR" });
    }
    body = raw === "" ? "{}" : raw;
  }

  const apiUrl = process.env.INTERNAL_API_URL;
  if (!apiUrl) return json(500, { error: "CONFIG_ERROR", message: "CONFIG_ERROR" });

  const clientIp = resolveWebClientIp((name) => req.headers.get(name));
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/voice/${action}`, {
      method,
      headers: {
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        "Authorization": `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ""}`,
        "X-User-ID": session.user.id,
        "X-User-Email": session.user.email,
        ...(clientIp ? { "X-Client-IP": clientIp } : {}),
      },
      ...(body !== undefined ? { body } : {}),
      // transcribe waits for the provider; the others are tiny.
      signal: AbortSignal.timeout(action === "transcribe" ? 55_000 : 15_000),
    });
  } catch (err) {
    console.error("voice proxy: failed to reach INTERNAL_API_URL", apiUrl, err);
    return json(502, { error: "UPSTREAM_UNREACHABLE", message: "UPSTREAM_UNREACHABLE" });
  }

  // Pass the status and the JSON body through; never the upstream's headers.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

type RouteContext = { params: Promise<{ action: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return forward(req, "GET", (await ctx.params).action);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return forward(req, "POST", (await ctx.params).action);
}
