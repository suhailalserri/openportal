/**
 * P6.3b: thin HTTP bridge for `voice.*`, so the browser can reach it through the web proxy
 * (apps/web/app/api/voice/[action]/route.ts) WITHOUT a session token in JavaScript.
 *
 * WHY NOT tRPC OVER HTTP: `createContext` (routers/trpc.ts) resolves a user only from the session
 * cookie or a Bearer SESSION token. The web proxy authenticates with the internal service token plus
 * X-User-ID, which only `authMiddleware` understands. So these routes run behind `authMiddleware` and
 * call the existing procedures in-process through a tRPC caller; no procedure, schema or billing rule
 * is duplicated.
 *
 *   GET  /voice/status      -> { available }    (speech model + storage configured; hides the mic)
 *   POST /voice/upload-url  -> voice.createUploadUrl
 *   POST /voice/confirm     -> voice.confirm
 *   POST /voice/transcribe  -> voice.transcribe (BILLED, runs under the P1.2 lock inside the procedure)
 *
 * Errors: `{ error: <stable code>, message: <same code> }` with an HTTP status. The codes are the ones
 * documented in docs/frontend/API_CONTRACT.md; this file never rewords them and never forwards an
 * unexpected message (a non-code message becomes VALIDATION_ERROR or INTERNAL_ERROR).
 *
 * Deliberately no @trpc/server or fastify VALUE imports: errors are recognised by shape, so the pure
 * parts are unit-tested anywhere.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const VOICE_ACTIONS = ["upload-url", "confirm", "transcribe"] as const;
export type VoiceAction = (typeof VOICE_ACTIONS)[number];

/** tRPC error code -> HTTP status (the standard mapping, spelled out so it is reviewable). */
const TRPC_CODE_HTTP: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};

/** A stable error code looks like THIS; anything else (a zod dump, a stack message) is never forwarded. */
const STABLE_CODE = /^[A-Z][A-Z0-9_]{2,60}$/;

export interface VoiceHttpError {
  status: number;
  body: { error: string; message: string };
}

export function toVoiceHttpError(err: unknown): VoiceHttpError {
  const e = (typeof err === "object" && err !== null ? err : {}) as { code?: unknown; message?: unknown };
  const trpcCode = typeof e.code === "string" ? e.code : undefined;
  if (!trpcCode || !(trpcCode in TRPC_CODE_HTTP)) {
    return { status: 500, body: { error: "INTERNAL_ERROR", message: "INTERNAL_ERROR" } };
  }
  const stable = typeof e.message === "string" && STABLE_CODE.test(e.message) ? e.message : null;
  if (stable === "INSUFFICIENT_BALANCE") {
    // The /chat equivalent is HTTP 402; keep the two consistent for the client.
    return { status: 402, body: { error: stable, message: stable } };
  }
  const status = TRPC_CODE_HTTP[trpcCode] ?? 500;
  if (stable) return { status, body: { error: stable, message: stable } };
  if (trpcCode === "BAD_REQUEST") return { status: 400, body: { error: "VALIDATION_ERROR", message: "VALIDATION_ERROR" } };
  if (status >= 500) return { status, body: { error: "INTERNAL_ERROR", message: "INTERNAL_ERROR" } };
  return { status, body: { error: trpcCode, message: trpcCode } };
}

/** The slice of the tRPC caller this bridge needs (kept structural so tests pass a fake). */
export interface VoiceCaller {
  voice: {
    createUploadUrl(input: unknown): Promise<unknown>;
    confirm(input: unknown): Promise<unknown>;
    transcribe(input: unknown): Promise<unknown>;
  };
}

export async function runVoiceAction(
  action: VoiceAction,
  body: unknown,
  caller: VoiceCaller,
): Promise<{ status: number; body: unknown }> {
  const input = typeof body === "object" && body !== null && !Array.isArray(body) ? body : {};
  try {
    const out =
      action === "upload-url" ? await caller.voice.createUploadUrl(input)
      : action === "confirm" ? await caller.voice.confirm(input)
      : await caller.voice.transcribe(input);
    return { status: 200, body: out };
  } catch (err) {
    return toVoiceHttpError(err);
  }
}

export interface VoiceRoutesDeps {
  /** `authMiddleware` (sends the 401/403 itself when it rejects). */
  preHandler: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  makeCaller: (req: FastifyRequest) => VoiceCaller;
  isAvailable: () => Promise<boolean>;
}

export function registerVoiceRoutes(app: FastifyInstance, deps: VoiceRoutesDeps): void {
  app.get("/voice/status", { preHandler: deps.preHandler }, async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    let available = false;
    try { available = await deps.isAvailable(); } catch { available = false; }
    return { available };
  });

  for (const action of VOICE_ACTIONS) {
    app.post(`/voice/${action}`, { preHandler: deps.preHandler }, async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const result = await runVoiceAction(action, req.body, deps.makeCaller(req));
      reply.status(result.status);
      return result.body;
    });
  }
}
