import { describe, it, expect } from "vitest";

import type { StorageLike } from "./chat-params-storage";
import {
  readStreamV2Enabled,
  STREAM_V2_FLAG_KEY,
  STREAM_V2_MEDIA_TYPE,
  writeStreamV2Enabled,
} from "./stream-mode";

/** In-memory StorageLike, same shape chat-params-storage.test.ts uses. */
function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
  };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceeded");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
  length: 0,
  key: () => null,
};

describe("stream-mode flag", () => {
  it("is off by default", () => {
    expect(readStreamV2Enabled(fakeStorage())).toBe(false);
  });

  it("is on only for the exact value 1", () => {
    expect(readStreamV2Enabled(fakeStorage({ [STREAM_V2_FLAG_KEY]: "1" }))).toBe(true);
    for (const v of ["0", "true", "yes", "", "2", " 1"]) {
      expect(readStreamV2Enabled(fakeStorage({ [STREAM_V2_FLAG_KEY]: v }))).toBe(false);
    }
  });

  it("round-trips, and turning it off removes the key instead of storing a 0", () => {
    const s = fakeStorage();
    writeStreamV2Enabled(true, s);
    expect(readStreamV2Enabled(s)).toBe(true);
    writeStreamV2Enabled(false, s);
    expect(readStreamV2Enabled(s)).toBe(false);
    expect(s.data.has(STREAM_V2_FLAG_KEY)).toBe(false);
  });

  it("never throws when storage is blocked or missing: it just reads as off", () => {
    expect(readStreamV2Enabled(throwing)).toBe(false);
    expect(() => writeStreamV2Enabled(true, throwing)).not.toThrow();
    expect(() => writeStreamV2Enabled(false, throwing)).not.toThrow();
    expect(readStreamV2Enabled(undefined)).toBe(false);
    expect(() => writeStreamV2Enabled(true, undefined)).not.toThrow();
  });

  it("uses a key outside the sign-out-cleared aip.chat. prefix, and the exact api media type", () => {
    expect(STREAM_V2_FLAG_KEY.startsWith("aip.chat.")).toBe(false);
    expect(STREAM_V2_MEDIA_TYPE).toBe("application/vnd.aip.stream+v2");
  });
});
