import { describe, it, expect, vi } from "vitest";

import { registerVoiceRoutes, runVoiceAction, toVoiceHttpError, VOICE_ACTIONS, type VoiceCaller } from "./voice-http";

/** A TRPCError-shaped object (code + message), no @trpc/server import needed. */
const trpc = (code: string, message: string) => Object.assign(new Error(message), { code });

function fakeCaller(over: Partial<Record<keyof VoiceCaller["voice"], (i: unknown) => Promise<unknown>>> = {}): VoiceCaller & {
  calls: { fn: string; input: unknown }[];
} {
  const calls: { fn: string; input: unknown }[] = [];
  const mk = (fn: keyof VoiceCaller["voice"]) => async (input: unknown) => {
    calls.push({ fn, input });
    return over[fn] ? over[fn]!(input) : { ok: fn };
  };
  return { calls, voice: { createUploadUrl: mk("createUploadUrl"), confirm: mk("confirm"), transcribe: mk("transcribe") } };
}

describe("toVoiceHttpError", () => {
  it("keeps the documented stable codes and maps their HTTP status", () => {
    const cases: [string, string, number][] = [
      ["PRECONDITION_FAILED", "INSUFFICIENT_BALANCE", 402],
      ["CONFLICT", "REQUEST_IN_PROGRESS", 409],
      ["SERVICE_UNAVAILABLE", "BILLING_LOCK_UNAVAILABLE", 503],
      ["SERVICE_UNAVAILABLE", "TRANSCRIPTION_NOT_CONFIGURED", 503],
      ["SERVICE_UNAVAILABLE", "STORAGE_DISABLED", 503],
      ["NOT_FOUND", "AUDIO_NOT_FOUND", 404],
      ["PAYLOAD_TOO_LARGE", "AUDIO_TOO_LONG", 413],
      ["BAD_REQUEST", "AUDIO_UNUSABLE", 400],
      ["BAD_GATEWAY", "TRANSCRIPTION_FAILED", 502],
      ["UNSUPPORTED_MEDIA_TYPE", "INVALID_MIME", 415],
      ["TOO_MANY_REQUESTS", "QUOTA_DAILY", 429],
    ];
    for (const [code, message, status] of cases) {
      expect(toVoiceHttpError(trpc(code, message))).toEqual({ status, body: { error: message, message } });
    }
  });

  it("turns a zod-style BAD_REQUEST dump into VALIDATION_ERROR and never forwards the raw text", () => {
    const r = toVoiceHttpError(trpc("BAD_REQUEST", '[{"code":"invalid_type","path":["audioId"]}]'));
    expect(r).toEqual({ status: 400, body: { error: "VALIDATION_ERROR", message: "VALIDATION_ERROR" } });
  });

  it("maps UNAUTHORIZED / FORBIDDEN with no stable message to their own code", () => {
    expect(toVoiceHttpError(trpc("UNAUTHORIZED", "UNAUTHORIZED")).status).toBe(401);
    expect(toVoiceHttpError(trpc("FORBIDDEN", "ACCOUNT_SUSPENDED"))).toEqual({
      status: 403,
      body: { error: "ACCOUNT_SUSPENDED", message: "ACCOUNT_SUSPENDED" },
    });
  });

  it("hides unexpected failures: 500 INTERNAL_ERROR, nothing from the message", () => {
    for (const err of [new Error("db password is hunter2"), trpc("INTERNAL_SERVER_ERROR", "connection refused"), "boom", null, undefined]) {
      const r = toVoiceHttpError(err);
      expect(r).toEqual({ status: 500, body: { error: "INTERNAL_ERROR", message: "INTERNAL_ERROR" } });
    }
  });
});

describe("runVoiceAction", () => {
  it("routes each action to its procedure and returns 200 with the procedure's result", async () => {
    const caller = fakeCaller();
    expect(await runVoiceAction("upload-url", { a: 1 }, caller)).toEqual({ status: 200, body: { ok: "createUploadUrl" } });
    expect(await runVoiceAction("confirm", { b: 2 }, caller)).toEqual({ status: 200, body: { ok: "confirm" } });
    expect(await runVoiceAction("transcribe", { c: 3 }, caller)).toEqual({ status: 200, body: { ok: "transcribe" } });
    expect(caller.calls).toEqual([
      { fn: "createUploadUrl", input: { a: 1 } },
      { fn: "confirm", input: { b: 2 } },
      { fn: "transcribe", input: { c: 3 } },
    ]);
  });

  it("passes {} for a missing, null, array or primitive body, so the procedure's own validation answers", async () => {
    const caller = fakeCaller();
    for (const body of [undefined, null, [1, 2], "x", 5]) await runVoiceAction("confirm", body, caller);
    expect(caller.calls.map((c) => c.input)).toEqual([{}, {}, {}, {}, {}]);
  });

  it("converts a thrown procedure error to the HTTP shape instead of throwing", async () => {
    const caller = fakeCaller({ transcribe: async () => { throw trpc("PRECONDITION_FAILED", "INSUFFICIENT_BALANCE"); } });
    expect(await runVoiceAction("transcribe", {}, caller)).toEqual({
      status: 402,
      body: { error: "INSUFFICIENT_BALANCE", message: "INSUFFICIENT_BALANCE" },
    });
  });
});

describe("registerVoiceRoutes", () => {
  type Handler = (req: unknown, reply: Record<string, unknown>) => Promise<unknown>;
  function fakeApp() {
    const routes: { method: string; path: string; opts: { preHandler: unknown }; handler: Handler }[] = [];
    const app = {
      get: (path: string, opts: { preHandler: unknown }, handler: Handler) => routes.push({ method: "GET", path, opts, handler }),
      post: (path: string, opts: { preHandler: unknown }, handler: Handler) => routes.push({ method: "POST", path, opts, handler }),
    };
    return { app, routes };
  }
  const fakeReply = () => {
    const r = { headers: {} as Record<string, string>, code: 0 } as Record<string, unknown> & { headers: Record<string, string>; code: number };
    r.header = (k: string, v: string) => { r.headers[k] = v; return r; };
    r.status = (c: number) => { r.code = c; return r; };
    return r;
  };

  it("registers status plus one POST per action, every one behind the auth pre-handler", () => {
    const { app, routes } = fakeApp();
    const preHandler = vi.fn(async () => {});
    registerVoiceRoutes(app as never, { preHandler, makeCaller: () => fakeCaller(), isAvailable: async () => true });
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /voice/status",
      ...VOICE_ACTIONS.map((a) => `POST /voice/${a}`),
    ]);
    for (const r of routes) expect(r.opts.preHandler).toBe(preHandler);
  });

  it("status reports availability, never caches, and treats a failing check as unavailable", async () => {
    for (const [isAvailable, expected] of [
      [async () => true, true],
      [async () => false, false],
      [async () => { throw new Error("db down"); }, false],
    ] as const) {
      const { app, routes } = fakeApp();
      registerVoiceRoutes(app as never, { preHandler: async () => {}, makeCaller: () => fakeCaller(), isAvailable });
      const reply = fakeReply();
      const out = await routes[0]!.handler({}, reply);
      expect(out).toEqual({ available: expected });
      expect(reply.headers["Cache-Control"]).toBe("no-store");
    }
  });

  it("a POST sets the status from the result, sends no-store, and builds the caller from the request", async () => {
    const { app, routes } = fakeApp();
    const caller = fakeCaller({ transcribe: async () => { throw trpc("CONFLICT", "REQUEST_IN_PROGRESS"); } });
    const makeCaller = vi.fn(() => caller);
    registerVoiceRoutes(app as never, { preHandler: async () => {}, makeCaller, isAvailable: async () => true });
    const post = routes.find((r) => r.path === "/voice/transcribe")!;
    const req = { body: { audioId: "x" }, user: { id: "u1" } };
    const reply = fakeReply();
    const out = await post.handler(req, reply);
    expect(makeCaller).toHaveBeenCalledWith(req);
    expect(reply.code).toBe(409);
    expect(reply.headers["Cache-Control"]).toBe("no-store");
    expect(out).toEqual({ error: "REQUEST_IN_PROGRESS", message: "REQUEST_IN_PROGRESS" });
  });
});
