/**
 * P5.3 money paths, with every side effect injected. RED on the naive version (provider called
 * before the affordability check, or billed on provider failure); GREEN with runTranscription.
 */
import { describe, it, expect, vi } from "vitest";
import { runTranscription, type TranscriptionDeps, type ProviderOutcome } from "./transcription.core";

const CV = 0.001;
const MODEL = { id: "whisper-1", provider: "openai", wholesaleCostInputPerM: "100", markupMultiplier: "2" };
const AUDIO = { id: "a1", mimeType: "audio/webm", sizeBytes: 80_000 }; // floor 5 s
const INPUT = { userId: "u1", audioId: "a1", requestId: "r1", durationMs: 10_000 };
const OK = (body: unknown): ProviderOutcome => ({ kind: "ok", body });

function mk(over: Partial<TranscriptionDeps> = {}) {
  const deps = {
    loadModel:     vi.fn(async () => MODEL),
    loadAudio:     vi.fn(async () => AUDIO),
    getBalanceMicro: vi.fn(async () => 1_000_000_000),
    downloadAudio: vi.fn(async () => new Uint8Array([1, 2, 3])),
    callProvider:  vi.fn(async (): Promise<ProviderOutcome> => OK({ text: "hello", usage: { type: "duration", seconds: 42.2 } })),
    deduct:        vi.fn(async () => ({ success: true })),
    discard:       vi.fn(async () => {}),
    creditValueUsd: CV,
    onBilled:      vi.fn(),
    onUpstream:    vi.fn(),
    onError:       vi.fn(),
    ...over,
  };
  return deps as typeof deps & TranscriptionDeps;
}
const n = (f: { mock: { calls: unknown[] } }) => f.mock.calls.length;

describe("configuration and input", () => {
  it("no transcription model -> NOT_CONFIGURED, nothing else touched", async () => {
    const d = mk({ loadModel: vi.fn(async () => null) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "TRANSCRIPTION_NOT_CONFIGURED" });
    expect(n(d.loadAudio)).toBe(0);
    expect(n(d.callProvider)).toBe(0);
  });
  it("a token-looking price is refused, not sold near-free", async () => {
    const d = mk({ loadModel: vi.fn(async () => ({ ...MODEL, wholesaleCostInputPerM: "2.5" })) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "TRANSCRIPTION_NOT_CONFIGURED" });
    expect(n(d.callProvider)).toBe(0);
  });
  it("foreign / missing / unconfirmed audio -> AUDIO_NOT_FOUND before any provider call", async () => {
    const d = mk({ loadAudio: vi.fn(async () => null) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "AUDIO_NOT_FOUND" });
    expect(n(d.callProvider)).toBe(0);
    expect(n(d.deduct)).toBe(0);
  });
  it("over 300 s -> AUDIO_TOO_LONG before download and provider", async () => {
    const d = mk();
    await expect(runTranscription({ ...INPUT, durationMs: 301_000 }, d)).rejects.toMatchObject({ code: "AUDIO_TOO_LONG" });
    expect(n(d.downloadAudio)).toBe(0);
    expect(n(d.callProvider)).toBe(0);
  });
});

describe("affordability gate (RED on old order)", () => {
  it("an unaffordable request never reaches the provider, is not billed and keeps nothing", async () => {
    // 10 s at 2x of 100/1M s = 2 credits = 2,000,000 micro; balance 1,999,999.
    const d = mk({ getBalanceMicro: vi.fn(async () => 1_999_999) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(n(d.downloadAudio)).toBe(0);
    expect(n(d.callProvider)).toBe(0);
    expect(n(d.deduct)).toBe(0);
  });
  it("exactly enough balance passes", async () => {
    const d = mk({ getBalanceMicro: vi.fn(async () => 2_000_000) });
    const r = await runTranscription(INPUT, d);
    expect(r.text).toBe("hello");
  });
  it("zero balance is rejected", async () => {
    const d = mk({ getBalanceMicro: vi.fn(async () => 0) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(n(d.callProvider)).toBe(0);
  });
});

describe("billing", () => {
  it("bills the provider-reported duration, rounded up, exactly once, then deletes the audio", async () => {
    const d = mk();
    const r = await runTranscription(INPUT, d);
    expect(r).toEqual({ text: "hello", seconds: 43, creditsCharged: 8_600_000, modelId: "whisper-1" });
    expect(n(d.deduct)).toBe(1);
    expect(d.deduct.mock.calls[0]).toEqual(["u1", 8_600_000, { modelId: "whisper-1", requestId: "r1", seconds: 43 }]);
    expect(n(d.discard)).toBe(1);
    expect(d.onBilled.mock.calls[0]).toEqual(["whisper-1", 8_600_000]);
  });
  it("provider reports a longer duration than declared: the provider's number is billed", async () => {
    const d = mk({ callProvider: vi.fn(async () => OK({ text: "x", usage: { type: "duration", seconds: 120 } })) });
    const r = await runTranscription({ ...INPUT, durationMs: 5_000 }, d);
    expect(r.seconds).toBe(120);
  });
  it("no duration reported (token usage): bills our estimate", async () => {
    const d = mk({ callProvider: vi.fn(async () => OK({ text: "x", usage: { type: "tokens", input_tokens: 9, output_tokens: 3 } })) });
    const r = await runTranscription(INPUT, d); // declared 10 s, floor 5 s
    expect(r.seconds).toBe(10);
    expect(r.creditsCharged).toBe(2_000_000);
  });
  it("a client that under-declares cannot pay less than the file size implies", async () => {
    const d = mk({
      loadAudio: vi.fn(async () => ({ ...AUDIO, sizeBytes: 160_000 })), // at least 10 s
      callProvider: vi.fn(async () => OK({ text: "x" })),
    });
    const r = await runTranscription({ ...INPUT, durationMs: 1_000 }, d);
    expect(r.seconds).toBe(10);
  });
  it("silence is billed like speech (the provider charged us) and returns an empty transcript", async () => {
    const d = mk({ callProvider: vi.fn(async () => OK({ text: "", usage: { type: "duration", seconds: 4 } })) });
    const r = await runTranscription(INPUT, d);
    expect(r.text).toBe("");
    expect(n(d.deduct)).toBe(1);
  });
});

describe("failures never bill (RED on a version that deducts before checking the result)", () => {
  it("provider 503: not billed, audio kept for a retry", async () => {
    const d = mk({ callProvider: vi.fn(async () => ({ kind: "http", status: 503 } as ProviderOutcome)) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "TRANSCRIPTION_UNAVAILABLE" });
    expect(n(d.deduct)).toBe(0);
    expect(n(d.discard)).toBe(0);
  });
  it("provider 429 and 404 are also 'unavailable', not billed", async () => {
    for (const status of [429, 404, 401]) {
      const d = mk({ callProvider: vi.fn(async () => ({ kind: "http", status } as ProviderOutcome)) });
      await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "TRANSCRIPTION_UNAVAILABLE" });
      expect(n(d.deduct)).toBe(0);
    }
  });
  it("network error / timeout: not billed, audio kept", async () => {
    const d = mk({ callProvider: vi.fn(async () => ({ kind: "network" } as ProviderOutcome)) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "TRANSCRIPTION_UNAVAILABLE" });
    expect(n(d.deduct)).toBe(0);
    expect(n(d.discard)).toBe(0);
  });
  it("provider 400 (undecodable file): not billed, recording deleted", async () => {
    const d = mk({ callProvider: vi.fn(async () => ({ kind: "http", status: 400 } as ProviderOutcome)) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "AUDIO_UNUSABLE" });
    expect(n(d.deduct)).toBe(0);
    expect(n(d.discard)).toBe(1);
  });
  it("garbage 200 body: not billed", async () => {
    const d = mk({ callProvider: vi.fn(async () => OK({ nope: true })) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "TRANSCRIPTION_FAILED" });
    expect(n(d.deduct)).toBe(0);
  });
  it("storage lost the bytes: AUDIO_NOT_FOUND, provider never called", async () => {
    const d = mk({ downloadAudio: vi.fn(async () => null) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "AUDIO_NOT_FOUND" });
    expect(n(d.callProvider)).toBe(0);
  });
});

describe("fail closed when the deduction is refused", () => {
  it("withholds the transcript, deletes the audio, reports loudly, does not count revenue", async () => {
    const d = mk({ deduct: vi.fn(async () => ({ success: false })) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(n(d.discard)).toBe(1);
    expect(n(d.onError)).toBe(1);
    expect(n(d.onBilled)).toBe(0);
  });
  it("a THROWN deduction is treated the same way", async () => {
    const d = mk({ deduct: vi.fn(async () => { throw new Error("db down"); }) });
    await expect(runTranscription(INPUT, d)).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(n(d.onError)).toBe(2);
    expect(n(d.onBilled)).toBe(0);
  });
});

describe("request shape", () => {
  it("forwards model, bytes, mime, a normalized language hint and the request id", async () => {
    const d = mk();
    await runTranscription({ ...INPUT, language: " AR " }, d);
    const call = d.callProvider.mock.calls[0]![0] as { modelId: string; mime: string; language?: string; requestId: string; userId: string };
    expect(call.modelId).toBe("whisper-1");
    expect(call.mime).toBe("audio/webm");
    expect(call.language).toBe("ar");
    expect(call.requestId).toBe("r1");
    expect(call.userId).toBe("u1");
  });
  it("drops a junk language hint", async () => {
    const d = mk();
    await runTranscription({ ...INPUT, language: "klingon" }, d);
    expect((d.callProvider.mock.calls[0]![0] as { language?: string }).language).toBeUndefined();
  });
});
