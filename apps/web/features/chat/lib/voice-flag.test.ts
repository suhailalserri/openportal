import { describe, it, expect } from "vitest";

import type { StorageLike } from "./chat-params-storage";
import { readVoiceEnabled, VOICE_FLAG_KEY, writeVoiceEnabled } from "./voice-flag";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k),
    get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null };
}
const throwing: StorageLike = {
  getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("Quota"); },
  removeItem: () => { throw new Error("SecurityError"); }, length: 0, key: () => null,
};

describe("voice flag", () => {
  it("is off by default and on only for the exact value 1", () => {
    expect(readVoiceEnabled(fakeStorage())).toBe(false);
    expect(readVoiceEnabled(fakeStorage({ [VOICE_FLAG_KEY]: "1" }))).toBe(true);
    for (const v of ["0", "true", "", "2", " 1"]) expect(readVoiceEnabled(fakeStorage({ [VOICE_FLAG_KEY]: v }))).toBe(false);
  });
  it("round-trips, and off removes the key", () => {
    const s = fakeStorage();
    writeVoiceEnabled(true, s);
    expect(readVoiceEnabled(s)).toBe(true);
    writeVoiceEnabled(false, s);
    expect(s.data.has(VOICE_FLAG_KEY)).toBe(false);
  });
  it("never throws on blocked or missing storage, and is a different key from the stream flag", () => {
    expect(readVoiceEnabled(throwing)).toBe(false);
    expect(() => writeVoiceEnabled(true, throwing)).not.toThrow();
    expect(readVoiceEnabled(undefined)).toBe(false);
    expect(VOICE_FLAG_KEY).not.toBe("aip.flag.streamV2");
    expect(VOICE_FLAG_KEY.startsWith("aip.chat.")).toBe(false);
  });
});
