import { describe, it, expect } from "vitest";

import { createConversationRow, fetchAttachmentsAvailable, uploadAttachment } from "./attachments-client";

type Call = { url: string; init: RequestInit | undefined };
function fakeFetch(handlers: Record<string, (init: RequestInit | undefined, n: number) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const counts: Record<string, number> = {};
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(handlers).find((k) => url.startsWith(k));
    if (!key) throw new Error(`unexpected url ${url}`);
    counts[key] = (counts[key] ?? 0) + 1;
    return handlers[key]!(init, counts[key]!);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const fail = (status: number, error: string) => new Response(JSON.stringify({ error }), { status });
const file = (name = "notes.py", size = 100) => Object.assign(new Blob([new Uint8Array(size)]), { name });
const noSleep = async () => {};

const upload = () => ok({ attachmentId: "att-1", uploadUrl: "https://storage.test/up?t=1", fileName: "notes.py", kind: "document", mimeType: "text/plain", maxBytes: 1 });
const put = () => new Response(null, { status: 200 });
const view = (status: string, extra: Record<string, unknown> = {}) => ok({ id: "att-1", fileName: "notes.py", kind: "document", sizeBytes: 100, status, errorCode: null, truncated: false, ...extra });

describe("uploadAttachment", () => {
  it("runs upload-url, PUT, confirm in order and returns the ready attachment when confirm already says ready", async () => {
    const { f, calls } = fakeFetch({
      "/api/attachments/upload-url": upload, "https://storage.test/": put, "/api/attachments/confirm": () => view("ready"),
    });
    const r = await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c-1", fetchImpl: f, sleep: noSleep });
    expect(r).toEqual({ ok: true, value: { id: "att-1", fileName: "notes.py", kind: "document", sizeBytes: 100, truncated: false } });
    expect(calls.map((c) => c.url)).toEqual(["/api/attachments/upload-url", "https://storage.test/up?t=1", "/api/attachments/confirm"]);
    expect(calls.map((c) => c.init?.method)).toEqual(["POST", "PUT", "POST"]);
  });

  it("sends the conversation, file name, declared type and real size, and PUTs the raw file with that Content-Type", async () => {
    const { f, calls } = fakeFetch({ "/api/attachments/upload-url": upload, "https://storage.test/": put, "/api/attachments/confirm": () => view("ready") });
    const blob = file("data.csv", 321);
    await uploadAttachment({ file: blob, mimeType: "text/plain", conversationId: "c-9", fetchImpl: f, sleep: noSleep });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ conversationId: "c-9", fileName: "data.csv", mimeType: "text/plain", sizeBytes: 321 });
    expect(calls[1]!.init!.body).toBe(blob);
    expect((calls[1]!.init!.headers as Record<string, string>)["Content-Type"]).toBe("text/plain");
  });

  it("polls until the server has read the file, reports the stages, and carries the truncated flag", async () => {
    const stages: string[] = [];
    let polls = 0;
    const { f, calls } = fakeFetch({
      "/api/attachments/upload-url": upload, "https://storage.test/": put,
      "/api/attachments/confirm": () => view("processing"),
      "/api/attachments/get": () => { polls++; return polls < 3 ? view("processing") : view("ready", { truncated: true }); },
    });
    const r = await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c", fetchImpl: f, sleep: noSleep, onStage: (s) => stages.push(s) });
    expect(r).toEqual({ ok: true, value: { id: "att-1", fileName: "notes.py", kind: "document", sizeBytes: 100, truncated: true } });
    expect(stages).toEqual(["uploading", "reading"]);
    expect(calls.filter((c) => c.url === "/api/attachments/get")).toHaveLength(3);
  });

  it("a file the server could not read fails with the server's extraction code", async () => {
    const { f } = fakeFetch({
      "/api/attachments/upload-url": upload, "https://storage.test/": put,
      "/api/attachments/confirm": () => view("processing"),
      "/api/attachments/get": () => view("failed", { errorCode: "NO_TEXT" }),
    });
    expect(await uploadAttachment({ file: file(), mimeType: "application/pdf", conversationId: "c", fetchImpl: f, sleep: noSleep })).toEqual({ ok: false, code: "NO_TEXT" });
  });

  it("gives up with TIMEOUT when extraction never finishes", async () => {
    const { f } = fakeFetch({
      "/api/attachments/upload-url": upload, "https://storage.test/": put,
      "/api/attachments/confirm": () => view("processing"), "/api/attachments/get": () => view("processing"),
    });
    expect(await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c", fetchImpl: f, sleep: noSleep, maxWaitMs: 3000 })).toEqual({ ok: false, code: "TIMEOUT" });
  });

  it("stops at the first failing step and reports its code", async () => {
    const quota = fakeFetch({ "/api/attachments/upload-url": () => fail(429, "QUOTA_DAILY") });
    expect(await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c", fetchImpl: quota.f, sleep: noSleep })).toEqual({ ok: false, code: "QUOTA_DAILY" });
    expect(quota.calls).toHaveLength(1);

    const noConv = fakeFetch({ "/api/attachments/upload-url": () => fail(404, "CONVERSATION_NOT_FOUND") });
    expect(await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c", fetchImpl: noConv.f, sleep: noSleep })).toEqual({ ok: false, code: "CONVERSATION_NOT_FOUND" });

    const badPut = fakeFetch({ "/api/attachments/upload-url": upload, "https://storage.test/": () => new Response(null, { status: 403 }) });
    expect(await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c", fetchImpl: badPut.f, sleep: noSleep })).toEqual({ ok: false, code: "UPLOAD_FAILED" });
    expect(badPut.calls).toHaveLength(2);

    const queue = fakeFetch({ "/api/attachments/upload-url": upload, "https://storage.test/": put, "/api/attachments/confirm": () => fail(503, "QUEUE_UNAVAILABLE") });
    expect(await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c", fetchImpl: queue.f, sleep: noSleep })).toEqual({ ok: false, code: "QUEUE_UNAVAILABLE" });
  });

  it("network errors: NETWORK for the api calls, UPLOAD_FAILED for the PUT", async () => {
    const down = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect(await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c", fetchImpl: down, sleep: noSleep })).toEqual({ ok: false, code: "NETWORK" });
    const putDown = fakeFetch({ "/api/attachments/upload-url": upload, "https://storage.test/": () => { throw new TypeError("x"); } });
    expect(await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c", fetchImpl: putDown.f, sleep: noSleep })).toEqual({ ok: false, code: "UPLOAD_FAILED" });
  });

  it("an aborted upload stops polling instead of looping", async () => {
    const ctrl = new AbortController();
    let gets = 0;
    const { f } = fakeFetch({
      "/api/attachments/upload-url": upload, "https://storage.test/": put,
      "/api/attachments/confirm": () => view("processing"),
      "/api/attachments/get": () => { gets++; ctrl.abort(); return view("processing"); },
    });
    const r = await uploadAttachment({ file: file(), mimeType: "text/plain", conversationId: "c", fetchImpl: f, sleep: noSleep, signal: ctrl.signal });
    expect(r).toEqual({ ok: false, code: "NETWORK" });
    expect(gets).toBe(1);
  });
});

describe("fetchAttachmentsAvailable", () => {
  it("is true only for an explicit available: true, and false on any failure", async () => {
    expect(await fetchAttachmentsAvailable(fakeFetch({ "/api/attachments/status": () => ok({ available: true }) }).f)).toBe(true);
    expect(await fetchAttachmentsAvailable(fakeFetch({ "/api/attachments/status": () => ok({ available: false }) }).f)).toBe(false);
    expect(await fetchAttachmentsAvailable(fakeFetch({ "/api/attachments/status": () => ok({ available: 1 }) }).f)).toBe(false);
    expect(await fetchAttachmentsAvailable(fakeFetch({ "/api/attachments/status": () => fail(401, "UNAUTHORIZED") }).f)).toBe(false);
    expect(await fetchAttachmentsAvailable((async () => { throw new Error("x"); }) as unknown as typeof fetch)).toBe(false);
  });
});

describe("createConversationRow", () => {
  it("POSTs to the existing conversations route and returns the new id", async () => {
    const { f, calls } = fakeFetch({ "/api/conversations": () => ok({ id: "conv-7", userId: "u", title: null }) });
    expect(await createConversationRow(f)).toBe("conv-7");
    expect(calls[0]!.init?.method).toBe("POST");
  });
  it("returns null on any failure, never throws", async () => {
    expect(await createConversationRow(fakeFetch({ "/api/conversations": () => fail(401, "x") }).f)).toBeNull();
    expect(await createConversationRow(fakeFetch({ "/api/conversations": () => ok({}) }).f)).toBeNull();
    expect(await createConversationRow(fakeFetch({ "/api/conversations": () => ok({ id: "" }) }).f)).toBeNull();
    expect(await createConversationRow((async () => { throw new Error("x"); }) as unknown as typeof fetch)).toBeNull();
  });
});
