import { describe, it, expect } from "vitest";

import { fetchVoiceAvailable, transcribeRecording } from "./voice-client";

type Call = { url: string; init: RequestInit | undefined };

/** Scripted fetch: one handler per URL prefix, every call recorded in order. */
function fakeFetch(handlers: Record<string, (init: RequestInit | undefined) => Response | Promise<Response> | never>) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(handlers).find((k) => url.startsWith(k));
    if (!key) throw new Error(`unexpected url ${url}`);
    return handlers[key]!(init);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const fail = (status: number, error: string) => new Response(JSON.stringify({ error }), { status });
const blob = () => new Blob([new Uint8Array(2048)], { type: "audio/webm" });

const happy = () =>
  fakeFetch({
    "/api/voice/upload-url": () => ok({ audioId: "a-1", uploadUrl: "https://storage.test/up?t=1", mimeType: "audio/webm", maxBytes: 1 }),
    "https://storage.test/": () => new Response(null, { status: 200 }),
    "/api/voice/confirm": () => ok({ audioId: "a-1", sizeBytes: 2048 }),
    "/api/voice/transcribe": () => ok({ text: "  hello world ", seconds: 3, creditsCharged: 120000, modelId: "w" }),
  });

describe("transcribeRecording", () => {
  it("runs upload-url, PUT, confirm, transcribe in that order and returns the trimmed text", async () => {
    const { f, calls } = happy();
    const r = await transcribeRecording({ blob: blob(), mimeType: "audio/webm;codecs=opus", durationMs: 3200.6, language: "en", fetchImpl: f });
    expect(r).toEqual({ ok: true, value: { text: "hello world", creditsCharged: 120000 } });
    expect(calls.map((c) => c.url)).toEqual(["/api/voice/upload-url", "https://storage.test/up?t=1", "/api/voice/confirm", "/api/voice/transcribe"]);
    expect(calls.map((c) => c.init?.method)).toEqual(["POST", "PUT", "POST", "POST"]);
  });

  it("sends the base mime type and the real size, PUTs the raw blob with that Content-Type, and passes duration + language", async () => {
    const { f, calls } = happy();
    const b = blob();
    await transcribeRecording({ blob: b, mimeType: "audio/webm;codecs=opus", durationMs: 3200.6, language: "ar", fetchImpl: f });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ mimeType: "audio/webm", sizeBytes: 2048 });
    expect(calls[1]!.init!.body).toBe(b);
    expect((calls[1]!.init!.headers as Record<string, string>)["Content-Type"]).toBe("audio/webm");
    expect(JSON.parse(calls[3]!.init!.body as string)).toEqual({ audioId: "a-1", durationMs: 3201, language: "ar" });
  });

  it("omits language when none is given, and never sends a duration below 1 ms", async () => {
    const { f, calls } = happy();
    await transcribeRecording({ blob: blob(), mimeType: "audio/mp4", durationMs: 0, fetchImpl: f });
    expect(JSON.parse(calls[3]!.init!.body as string)).toEqual({ audioId: "a-1", durationMs: 1 });
  });

  it("stops at the first failure and reports the server's stable code (no later call is made)", async () => {
    const quota = fakeFetch({ "/api/voice/upload-url": () => fail(429, "QUOTA_DAILY") });
    expect(await transcribeRecording({ blob: blob(), mimeType: "audio/webm", durationMs: 2000, fetchImpl: quota.f })).toEqual({ ok: false, code: "QUOTA_DAILY" });
    expect(quota.calls).toHaveLength(1);

    const broke = happy();
    const f2 = fakeFetch({
      "/api/voice/upload-url": () => ok({ audioId: "a", uploadUrl: "https://storage.test/u" }),
      "https://storage.test/": () => new Response(null, { status: 403 }),
    });
    expect(await transcribeRecording({ blob: blob(), mimeType: "audio/webm", durationMs: 2000, fetchImpl: f2.f })).toEqual({ ok: false, code: "UPLOAD_FAILED" });
    expect(f2.calls.map((c) => c.url)).toEqual(["/api/voice/upload-url", "https://storage.test/u"]);
    expect(broke.calls).toHaveLength(0);
  });

  it("a billed transcribe failure is reported with its code and is NOT retried", async () => {
    let transcribeCalls = 0;
    const { f } = fakeFetch({
      "/api/voice/upload-url": () => ok({ audioId: "a", uploadUrl: "https://storage.test/u" }),
      "https://storage.test/": () => new Response(null, { status: 200 }),
      "/api/voice/confirm": () => ok({}),
      "/api/voice/transcribe": () => { transcribeCalls++; return fail(402, "INSUFFICIENT_BALANCE"); },
    });
    expect(await transcribeRecording({ blob: blob(), mimeType: "audio/webm", durationMs: 2000, fetchImpl: f })).toEqual({ ok: false, code: "INSUFFICIENT_BALANCE" });
    expect(transcribeCalls).toBe(1);
  });

  it("an empty transcript is SILENCE (the server bills silence, so the UI says so)", async () => {
    const { f } = fakeFetch({
      "/api/voice/upload-url": () => ok({ audioId: "a", uploadUrl: "https://storage.test/u" }),
      "https://storage.test/": () => new Response(null, { status: 200 }),
      "/api/voice/confirm": () => ok({}),
      "/api/voice/transcribe": () => ok({ text: "   ", creditsCharged: 1 }),
    });
    expect(await transcribeRecording({ blob: blob(), mimeType: "audio/webm", durationMs: 2000, fetchImpl: f })).toEqual({ ok: false, code: "SILENCE" });
  });

  it("network failures are NETWORK (api calls) or UPLOAD_FAILED (the PUT); a platform HTML error is UNKNOWN or UNAUTHORIZED", async () => {
    const down = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect(await transcribeRecording({ blob: blob(), mimeType: "audio/webm", durationMs: 2000, fetchImpl: down })).toEqual({ ok: false, code: "NETWORK" });

    const html = fakeFetch({ "/api/voice/upload-url": () => new Response("<html>Bad gateway</html>", { status: 502 }) });
    expect(await transcribeRecording({ blob: blob(), mimeType: "audio/webm", durationMs: 2000, fetchImpl: html.f })).toEqual({ ok: false, code: "UNKNOWN" });

    const unauth = fakeFetch({ "/api/voice/upload-url": () => new Response("", { status: 401 }) });
    expect(await transcribeRecording({ blob: blob(), mimeType: "audio/webm", durationMs: 2000, fetchImpl: unauth.f })).toEqual({ ok: false, code: "UNAUTHORIZED" });

    const putDown = fakeFetch({
      "/api/voice/upload-url": () => ok({ audioId: "a", uploadUrl: "https://storage.test/u" }),
      "https://storage.test/": () => { throw new TypeError("Failed to fetch"); },
    });
    expect(await transcribeRecording({ blob: blob(), mimeType: "audio/webm", durationMs: 2000, fetchImpl: putDown.f })).toEqual({ ok: false, code: "UPLOAD_FAILED" });
  });

  it("never forwards an error string that is not a stable code", async () => {
    const odd = fakeFetch({ "/api/voice/upload-url": () => new Response(JSON.stringify({ error: "db password is hunter2" }), { status: 500 }) });
    expect(await transcribeRecording({ blob: blob(), mimeType: "audio/webm", durationMs: 2000, fetchImpl: odd.f })).toEqual({ ok: false, code: "UNKNOWN" });
  });
});

describe("fetchVoiceAvailable", () => {
  it("is true only for an explicit available: true", async () => {
    expect(await fetchVoiceAvailable(fakeFetch({ "/api/voice/status": () => ok({ available: true }) }).f)).toBe(true);
    expect(await fetchVoiceAvailable(fakeFetch({ "/api/voice/status": () => ok({ available: false }) }).f)).toBe(false);
    expect(await fetchVoiceAvailable(fakeFetch({ "/api/voice/status": () => ok({ available: "yes" }) }).f)).toBe(false);
    expect(await fetchVoiceAvailable(fakeFetch({ "/api/voice/status": () => ok({}) }).f)).toBe(false);
  });
  it("is false on any failure: 401, 500, a network error", async () => {
    expect(await fetchVoiceAvailable(fakeFetch({ "/api/voice/status": () => fail(401, "UNAUTHORIZED") }).f)).toBe(false);
    expect(await fetchVoiceAvailable(fakeFetch({ "/api/voice/status": () => fail(500, "INTERNAL_ERROR") }).f)).toBe(false);
    expect(await fetchVoiceAvailable((async () => { throw new Error("x"); }) as unknown as typeof fetch)).toBe(false);
  });
  it("issues a GET with no body", async () => {
    const { f, calls } = fakeFetch({ "/api/voice/status": () => ok({ available: true }) });
    await fetchVoiceAvailable(f);
    expect(calls[0]!.init?.method).toBe("GET");
    expect(calls[0]!.init?.body).toBeUndefined();
  });
});
