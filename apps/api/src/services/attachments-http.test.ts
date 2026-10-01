import { describe, it, expect, vi } from "vitest";

import { ATTACHMENT_ACTIONS, registerAttachmentsRoutes, runAttachmentAction, type AttachmentsCaller } from "./attachments-http";

const trpc = (code: string, message: string) => Object.assign(new Error(message), { code });

function fakeCaller(over: Partial<Record<keyof AttachmentsCaller["attachments"], (i: unknown) => Promise<unknown>>> = {}) {
  const calls: { fn: string; input: unknown }[] = [];
  const mk = (fn: keyof AttachmentsCaller["attachments"]) => async (input: unknown) => {
    calls.push({ fn, input });
    return over[fn] ? over[fn]!(input) : { ok: fn };
  };
  const caller: AttachmentsCaller = { attachments: { createUploadUrl: mk("createUploadUrl"), confirm: mk("confirm"), get: mk("get") } };
  return Object.assign(caller, { calls });
}

describe("runAttachmentAction", () => {
  it("routes each action to its procedure", async () => {
    const c = fakeCaller();
    expect(await runAttachmentAction("upload-url", { a: 1 }, c)).toEqual({ status: 200, body: { ok: "createUploadUrl" } });
    expect(await runAttachmentAction("confirm", { b: 2 }, c)).toEqual({ status: 200, body: { ok: "confirm" } });
    expect(await runAttachmentAction("get", { c: 3 }, c)).toEqual({ status: 200, body: { ok: "get" } });
    expect(c.calls.map((x) => x.fn)).toEqual(["createUploadUrl", "confirm", "get"]);
  });
  it("passes {} for a non-object body", async () => {
    const c = fakeCaller();
    for (const b of [undefined, null, [1], "x", 3]) await runAttachmentAction("get", b, c);
    expect(c.calls.map((x) => x.input)).toEqual([{}, {}, {}, {}, {}]);
  });
  it("maps the attachment error codes to HTTP with the stable code, and hides unexpected failures", async () => {
    const cases: [string, string, number][] = [
      ["NOT_FOUND", "CONVERSATION_NOT_FOUND", 404],
      ["UNSUPPORTED_MEDIA_TYPE", "INVALID_MIME", 415],
      ["PAYLOAD_TOO_LARGE", "FILE_TOO_LARGE", 413],
      ["TOO_MANY_REQUESTS", "QUOTA_DAILY", 429],
      ["SERVICE_UNAVAILABLE", "STORAGE_DISABLED", 503],
      ["SERVICE_UNAVAILABLE", "QUEUE_UNAVAILABLE", 503],
    ];
    for (const [code, message, status] of cases) {
      const c = fakeCaller({ confirm: async () => { throw trpc(code, message); } });
      expect(await runAttachmentAction("confirm", {}, c)).toEqual({ status, body: { error: message, message } });
    }
    const boom = fakeCaller({ get: async () => { throw new Error("db password is hunter2"); } });
    expect(await runAttachmentAction("get", {}, boom)).toEqual({ status: 500, body: { error: "INTERNAL_ERROR", message: "INTERNAL_ERROR" } });
  });
});

describe("registerAttachmentsRoutes", () => {
  type Handler = (req: unknown, reply: Record<string, unknown>) => Promise<unknown>;
  function fakeApp() {
    const routes: { method: string; path: string; opts: { preHandler: unknown }; handler: Handler }[] = [];
    return {
      routes,
      app: {
        get: (path: string, opts: { preHandler: unknown }, handler: Handler) => routes.push({ method: "GET", path, opts, handler }),
        post: (path: string, opts: { preHandler: unknown }, handler: Handler) => routes.push({ method: "POST", path, opts, handler }),
      },
    };
  }
  const fakeReply = () => {
    const r = { headers: {} as Record<string, string>, code: 0 } as Record<string, unknown> & { headers: Record<string, string>; code: number };
    r.header = (k: string, v: string) => { r.headers[k] = v; return r; };
    r.status = (c: number) => { r.code = c; return r; };
    return r;
  };

  it("registers status plus one POST per action, all behind the auth pre-handler", () => {
    const { app, routes } = fakeApp();
    const preHandler = vi.fn(async () => {});
    registerAttachmentsRoutes(app as never, { preHandler, makeCaller: () => fakeCaller(), isAvailable: async () => true });
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /attachments/status", ...ATTACHMENT_ACTIONS.map((a) => `POST /attachments/${a}`)]);
    for (const r of routes) expect(r.opts.preHandler).toBe(preHandler);
  });
  it("status is no-store and a failing check means unavailable", async () => {
    for (const [isAvailable, expected] of [[async () => true, true], [async () => false, false], [async () => { throw new Error("x"); }, false]] as const) {
      const { app, routes } = fakeApp();
      registerAttachmentsRoutes(app as never, { preHandler: async () => {}, makeCaller: () => fakeCaller(), isAvailable });
      const reply = fakeReply();
      expect(await routes[0]!.handler({}, reply)).toEqual({ available: expected });
      expect(reply.headers["Cache-Control"]).toBe("no-store");
    }
  });
  it("a POST sets the HTTP status from the result and builds the caller from the request", async () => {
    const { app, routes } = fakeApp();
    const makeCaller = vi.fn(() => fakeCaller({ get: async () => { throw trpc("NOT_FOUND", "NOT_FOUND"); } }));
    registerAttachmentsRoutes(app as never, { preHandler: async () => {}, makeCaller, isAvailable: async () => true });
    const post = routes.find((r) => r.path === "/attachments/get")!;
    const req = { body: { attachmentId: "x" } };
    const reply = fakeReply();
    expect(await post.handler(req, reply)).toEqual({ error: "NOT_FOUND", message: "NOT_FOUND" });
    expect(makeCaller).toHaveBeenCalledWith(req);
    expect(reply.code).toBe(404);
    expect(reply.headers["Cache-Control"]).toBe("no-store");
  });
});
