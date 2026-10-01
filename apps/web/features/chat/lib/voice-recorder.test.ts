import { describe, it, expect } from "vitest";

import {
  appendTranscript, baseMime, formatClock, initialVoiceState, isMicUnavailableCode, pickRecorderMime,
  voiceErrorKey, voiceReducer, VOICE_MAX_MS, type VoiceState,
} from "./voice-recorder";

describe("pickRecorderMime", () => {
  it("prefers webm/opus, then webm, then mp4 (Safari), then ogg", () => {
    expect(pickRecorderMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecorderMime((m) => m !== "audio/webm;codecs=opus")).toBe("audio/webm");
    expect(pickRecorderMime((m) => m === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecorderMime((m) => m.startsWith("audio/ogg"))).toBe("audio/ogg;codecs=opus");
  });
  it("returns null when nothing is supported, and treats a throwing probe as unsupported", () => {
    expect(pickRecorderMime(() => false)).toBeNull();
    expect(pickRecorderMime(() => { throw new Error("nope"); })).toBeNull();
  });
});

describe("baseMime / formatClock", () => {
  it("strips parameters and lowercases", () => {
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMime(" Audio/MP4 ")).toBe("audio/mp4");
  });
  it("formats m:ss and survives bad input", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(12_000)).toBe("0:12");
    expect(formatClock(12_999)).toBe("0:12");
    expect(formatClock(65_400)).toBe("1:05");
    expect(formatClock(300_000)).toBe("5:00");
    expect(formatClock(-5)).toBe("0:00");
    expect(formatClock(Number.NaN)).toBe("0:00");
  });
});

describe("voiceErrorKey", () => {
  it("maps every documented voice code (docs/frontend/API_CONTRACT.md) to a specific message, not the generic one", () => {
    const documented = [
      "UNSUPPORTED_MEDIA_TYPE", "PAYLOAD_TOO_LARGE", "TOO_MANY_REQUESTS", "QUOTA_DAILY", "QUOTA_BYTES", "OBJECT_NOT_FOUND",
      "INSUFFICIENT_BALANCE", "REQUEST_IN_PROGRESS", "BILLING_LOCK_UNAVAILABLE", "AUDIO_NOT_FOUND", "AUDIO_TOO_LONG",
      "AUDIO_UNUSABLE", "TRANSCRIPTION_UNAVAILABLE", "TRANSCRIPTION_FAILED", "TRANSCRIPTION_NOT_CONFIGURED",
      "PERMISSION_DENIED", "NO_MICROPHONE", "UNSUPPORTED", "TOO_SHORT", "SILENCE", "NETWORK", "UPLOAD_FAILED",
    ];
    for (const c of documented) expect(voiceErrorKey(c)).not.toBe("voiceErrGeneric");
  });
  it("separates the cases the person can act on", () => {
    expect(voiceErrorKey("INSUFFICIENT_BALANCE")).toBe("voiceErrBalance");
    expect(voiceErrorKey("REQUEST_IN_PROGRESS")).toBe("voiceErrBusy");
    expect(voiceErrorKey("PERMISSION_DENIED")).toBe("voiceErrPermission");
    expect(voiceErrorKey("AUDIO_TOO_LONG")).toBe("voiceErrTooLong");
  });
  it("falls back to generic for an unknown code", () => {
    expect(voiceErrorKey("SOMETHING_NEW")).toBe("voiceErrGeneric");
    expect(voiceErrorKey("")).toBe("voiceErrGeneric");
  });
  it("only a not-configured code hides the mic for the session", () => {
    expect(isMicUnavailableCode("TRANSCRIPTION_NOT_CONFIGURED")).toBe(true);
    expect(isMicUnavailableCode("STORAGE_DISABLED")).toBe(true);
    expect(isMicUnavailableCode("TRANSCRIPTION_UNAVAILABLE")).toBe(false);
    expect(isMicUnavailableCode("NETWORK")).toBe(false);
  });
});

describe("voiceReducer", () => {
  const run = (s: VoiceState, ...a: Parameters<typeof voiceReducer>[1][]) => a.reduce(voiceReducer, s);

  it("walks idle -> requesting -> recording -> transcribing -> idle", () => {
    let s = initialVoiceState;
    s = run(s, { type: "REQUEST" });
    expect(s.phase).toBe("requesting");
    s = run(s, { type: "RECORDING" });
    expect(s.phase).toBe("recording");
    s = run(s, { type: "TICK", elapsedMs: 4200 });
    expect(s.elapsedMs).toBe(4200);
    s = run(s, { type: "TRANSCRIBING" });
    expect(s).toEqual({ phase: "transcribing", elapsedMs: 4200 });
    expect(run(s, { type: "FINISH" })).toEqual(initialVoiceState);
  });
  it("ignores illegal transitions (a late event from a finished recording)", () => {
    expect(run(initialVoiceState, { type: "RECORDING" })).toBe(initialVoiceState);
    expect(run(initialVoiceState, { type: "TRANSCRIBING" })).toBe(initialVoiceState);
    expect(run(initialVoiceState, { type: "TICK", elapsedMs: 5 })).toBe(initialVoiceState);
    const rec = run(initialVoiceState, { type: "REQUEST" }, { type: "RECORDING" });
    expect(run(rec, { type: "REQUEST" })).toBe(rec); // a second tap while recording does not restart
  });
  it("clamps elapsed time to the 5-minute cap and never goes negative", () => {
    const rec = run(initialVoiceState, { type: "REQUEST" }, { type: "RECORDING" });
    expect(run(rec, { type: "TICK", elapsedMs: 999_999 }).elapsedMs).toBe(VOICE_MAX_MS);
    expect(run(rec, { type: "TICK", elapsedMs: -3 }).elapsedMs).toBe(0);
  });
});

describe("appendTranscript", () => {
  it("adds one space after existing text, and nothing to an empty draft", () => {
    expect(appendTranscript("", "hello")).toBe("hello");
    expect(appendTranscript("so far  ", " hello ")).toBe("so far hello");
  });
  it("leaves the draft alone for an empty or whitespace transcript", () => {
    expect(appendTranscript("keep", "")).toBe("keep");
    expect(appendTranscript("keep ", "   ")).toBe("keep ");
  });
  it("keeps Arabic intact", () => {
    expect(appendTranscript("مرحبا", "كيف حالك")).toBe("مرحبا كيف حالك");
  });
});
