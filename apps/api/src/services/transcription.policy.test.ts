import { describe, it, expect } from "vitest";
import {
  TRANSCRIPTION_LIMITS, TranscriptionError, audioFileName, classifyUpstreamStatus, cleanTranscript,
  durationCeilingSeconds, durationFloorSeconds, estimateSeconds, normalizeLanguage,
  parseTranscriptionResponse, readPricing, resolveBillableSeconds, transcriptionCostMicro,
} from "./transcription.policy";

const CV = 0.001; // CREDIT_VALUE_USD

describe("duration estimate", () => {
  it("floors at the byte-size minimum: a tiny declared duration cannot under-bill a big file", () => {
    // 160,000 bytes of webm holds at least 10 s (128 kbps ceiling); the client claims 1 s.
    expect(estimateSeconds({ sizeBytes: 160_000, mime: "audio/webm", declaredMs: 1000 })).toBe(10);
  });
  it("uses the declared duration when it is plausible", () => {
    expect(estimateSeconds({ sizeBytes: 80_000, mime: "audio/webm", declaredMs: 10_000 })).toBe(10);
  });
  it("caps an inflated declaration at the 8 kbps ceiling", () => {
    // 8,000 bytes cannot hold more than 8 s; the client claims 200 s.
    expect(estimateSeconds({ sizeBytes: 8_000, mime: "audio/webm", declaredMs: 200_000 })).toBe(8);
  });
  it("without a declaration it uses the floor, never below the 1 s billing minimum", () => {
    expect(estimateSeconds({ sizeBytes: 100, mime: "audio/webm" })).toBe(1);
    expect(estimateSeconds({ sizeBytes: 160_000, mime: "audio/webm" })).toBe(10);
  });
  it("wav floors at a much higher byte rate than opus", () => {
    expect(durationFloorSeconds(192_000, "audio/wav")).toBe(1);
    expect(durationFloorSeconds(192_000, "audio/webm")).toBe(12);
  });
  it("rejects recordings over 300 s, by declaration or by size", () => {
    expect(() => estimateSeconds({ sizeBytes: 1_000_000, mime: "audio/webm", declaredMs: 301_000 })).toThrow();
    let code = "";
    try { estimateSeconds({ sizeBytes: 15 * 1024 * 1024, mime: "audio/webm" }); } catch (e) { code = (e as TranscriptionError).code; }
    expect(code).toBe("AUDIO_TOO_LONG");
  });
  it("ceiling is bytes / 1000", () => { expect(durationCeilingSeconds(5000)).toBe(5); });
});

describe("billable seconds", () => {
  it("the provider's reported duration wins and is rounded UP", () => {
    expect(resolveBillableSeconds(42.2, 10)).toBe(43);
    expect(resolveBillableSeconds(3, 99)).toBe(3);
  });
  it("falls back to the estimate when the provider reports nothing usable", () => {
    expect(resolveBillableSeconds(null, 9.2)).toBe(10);
    expect(resolveBillableSeconds(0, 9.2)).toBe(10);
    expect(resolveBillableSeconds(Number.NaN, 4)).toBe(4);
  });
  it("never bills under one second", () => { expect(resolveBillableSeconds(0.2, 0.1)).toBe(1); });
});

describe("pricing", () => {
  it("whisper-1 ($0.006/min = 100 per 1M seconds) at 2x: 60 s = 12 credits", () => {
    const p = readPricing({ wholesaleCostInputPerM: "100", markupMultiplier: "2.00" })!;
    expect(transcriptionCostMicro(p, 60, CV)).toBe(12_000_000);
    expect(transcriptionCostMicro(p, 43, CV)).toBe(8_600_000); // no float-noise extra micro-credit
  });
  it("rounds up and never charges zero", () => {
    const p = readPricing({ wholesaleCostInputPerM: "5", markupMultiplier: "1" })!;
    expect(transcriptionCostMicro(p, 1, CV)).toBe(5_000);
    expect(transcriptionCostMicro({ perMillionSeconds: 5, markup: 0.0000001 }, 1, CV)).toBe(1);
  });
  it("refuses an unset, zero, NaN or token-looking price", () => {
    expect(readPricing({ wholesaleCostInputPerM: "0", markupMultiplier: "2" })).toBeNull();
    expect(readPricing({ wholesaleCostInputPerM: "2.5", markupMultiplier: "2" })).toBeNull(); // a $/1M-token price
    expect(readPricing({ wholesaleCostInputPerM: "0.006", markupMultiplier: "2" })).toBeNull(); // a $/minute price
    expect(readPricing({ wholesaleCostInputPerM: "abc", markupMultiplier: "2" })).toBeNull();
    expect(readPricing({ wholesaleCostInputPerM: "100", markupMultiplier: "0" })).toBeNull();
  });
});

describe("provider response", () => {
  it("reads duration-typed usage", () => {
    expect(parseTranscriptionResponse({ text: " hi ", usage: { type: "duration", seconds: 12.5 } })).toEqual({ text: "hi", seconds: 12.5 });
  });
  it("reads verbose_json duration", () => {
    expect(parseTranscriptionResponse({ text: "x", duration: 7 })).toEqual({ text: "x", seconds: 7 });
  });
  it("token usage carries no seconds", () => {
    expect(parseTranscriptionResponse({ text: "x", usage: { type: "tokens", input_tokens: 10, output_tokens: 5 } })).toEqual({ text: "x", seconds: null });
  });
  it("accepts an empty transcript (silence) and rejects non-answers", () => {
    expect(parseTranscriptionResponse({ text: "" })).toEqual({ text: "", seconds: null });
    expect(parseTranscriptionResponse(null)).toBeNull();
    expect(parseTranscriptionResponse({ error: "x" })).toBeNull();
    expect(parseTranscriptionResponse({ text: 5 })).toBeNull();
  });
  it("ignores bogus durations", () => {
    expect(parseTranscriptionResponse({ text: "x", duration: -3 })).toEqual({ text: "x", seconds: null });
  });
  it("cleans control characters and caps the length", () => {
    expect(cleanTranscript("a\u0000b\u0007c\nd")).toBe("abc\nd");
    expect(cleanTranscript("x".repeat(TRANSCRIPTION_LIMITS.maxTranscriptChars + 5))).toHaveLength(TRANSCRIPTION_LIMITS.maxTranscriptChars);
  });
});

describe("small helpers", () => {
  it("language hint: two letters or dropped", () => {
    expect(normalizeLanguage(" AR ")).toBe("ar");
    expect(normalizeLanguage("arabic")).toBeUndefined();
    expect(normalizeLanguage("a\nb")).toBeUndefined();
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });
  it("file name extension follows the mime", () => {
    expect(audioFileName("audio/mp4")).toBe("audio.mp4");
    expect(audioFileName("audio/mpeg")).toBe("audio.mp3");
  });
  it("status classification: bad file vs our side", () => {
    expect(classifyUpstreamStatus(400)).toBe("unusable");
    expect(classifyUpstreamStatus(413)).toBe("unusable");
    expect(classifyUpstreamStatus(429)).toBe("unavailable");
    expect(classifyUpstreamStatus(503)).toBe("unavailable");
    expect(classifyUpstreamStatus(404)).toBe("unavailable");
    expect(classifyUpstreamStatus(401)).toBe("unavailable");
  });
});
