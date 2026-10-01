import { describe, it, expect } from "vitest";

import type { StorageLike } from "./chat-params-storage";
import { ATTACH_FLAG_KEY, readAttachEnabled, writeAttachEnabled } from "./attach-flag";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k),
    get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null };
}
const throwing: StorageLike = {
  getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("Quota"); },
  removeItem: () => { throw new Error("SecurityError"); }, length: 0, key: () => null,
};

describe("attach flag", () => {
  it("is off by default and on only for the exact value 1", () => {
    expect(readAttachEnabled(fakeStorage())).toBe(false);
    expect(readAttachEnabled(fakeStorage({ [ATTACH_FLAG_KEY]: "1" }))).toBe(true);
    for (const v of ["0", "true", "", "2", " 1"]) expect(readAttachEnabled(fakeStorage({ [ATTACH_FLAG_KEY]: v }))).toBe(false);
  });
  it("round-trips, off removes the key, never throws on blocked storage, distinct from the other flags", () => {
    const s = fakeStorage();
    writeAttachEnabled(true, s);
    expect(readAttachEnabled(s)).toBe(true);
    writeAttachEnabled(false, s);
    expect(s.data.has(ATTACH_FLAG_KEY)).toBe(false);
    expect(readAttachEnabled(throwing)).toBe(false);
    expect(() => writeAttachEnabled(true, throwing)).not.toThrow();
    expect(readAttachEnabled(undefined)).toBe(false);
    expect([ "aip.flag.streamV2", "aip.flag.voice" ]).not.toContain(ATTACH_FLAG_KEY);
    expect(ATTACH_FLAG_KEY.startsWith("aip.chat.")).toBe(false);
  });
});
