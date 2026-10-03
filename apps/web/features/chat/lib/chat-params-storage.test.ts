import { describe, it, expect, beforeEach } from "vitest";

import {
  CHAT_STORAGE_PREFIX,
  clearChatStorage,
  readLastModel,
  readParams,
  sanitizeParams,
  writeLastModel,
  writeParams,
  type StorageLike,
} from "./chat-params-storage";
import { clearAllClientCaches } from "@/lib/client-cache";
import { DEFAULT_CONVERSATION_PARAMS } from "../types";

/** Tiny in-memory Storage. `key(i)`/`length` are live, like the real one —
 *  which is exactly what makes remove-while-iterating a bug worth testing. */
function fakeStorage(seed: Record<string, string> = {}): StorageLike & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    dump: () => Object.fromEntries(map),
  };
}

/** P6.6 fields at their defaults, spread into every expectation that predates them. */
const X = { reasoningEffort: null, webSearch: false } as const;

describe("last model", () => {
  it("round-trips", () => {
    const s = fakeStorage();
    expect(readLastModel(s)).toBeUndefined();
    writeLastModel("gpt-4o", s);
    expect(readLastModel(s)).toBe("gpt-4o");
  });

  it("never throws when storage is unavailable or throws", () => {
    expect(readLastModel(undefined)).toBeUndefined();
    expect(() => writeLastModel("x", undefined)).not.toThrow();
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      length: 0,
      key: () => null,
    };
    expect(readLastModel(throwing)).toBeUndefined();
    expect(() => writeLastModel("x", throwing)).not.toThrow();
  });
});

describe("sanitizeParams", () => {
  it("keeps valid values", () => {
    expect(sanitizeParams({ temperature: 0.7, topP: 0.9, maxTokens: 512, ...X })).toEqual({
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 512,
      ...X,
    });
  });

  it("accepts the inclusive bounds", () => {
    expect(sanitizeParams({ temperature: 0, topP: 0, maxTokens: 1, ...X })).toEqual({
      temperature: 0,
      topP: 0,
      maxTokens: 1,
      ...X,
    });
    expect(sanitizeParams({ temperature: 2, topP: 1 }).temperature).toBe(2);
  });

  it("drops out-of-range, non-finite, wrong-type and non-integer values to null", () => {
    expect(
      sanitizeParams({ temperature: 2.5, topP: -0.1, maxTokens: 1.5 }),
    ).toEqual({ temperature: null, topP: null, maxTokens: null, ...X });
    expect(sanitizeParams({ temperature: "0.7", topP: Number.NaN, maxTokens: Infinity })).toEqual({
      temperature: null,
      topP: null,
      maxTokens: null,
      ...X,
    });
    expect(sanitizeParams(null)).toEqual({ temperature: null, topP: null, maxTokens: null, ...X });
    expect(sanitizeParams("junk")).toEqual({ temperature: null, topP: null, maxTokens: null, ...X });
  });
});

describe("per-conversation params", () => {
  it("round-trips per conversation id, independently", () => {
    const s = fakeStorage();
    writeParams("c1", { temperature: 0.2, topP: null, maxTokens: 100, ...X }, s);
    writeParams("c2", { temperature: 1.5, topP: 0.5, maxTokens: null, ...X }, s);
    expect(readParams("c1", s)).toEqual({ temperature: 0.2, topP: null, maxTokens: 100, ...X });
    expect(readParams("c2", s)).toEqual({ temperature: 1.5, topP: 0.5, maxTokens: null, ...X });
  });

  it("returns all-null for an unknown conversation and for corrupt JSON", () => {
    const s = fakeStorage({ [`${CHAT_STORAGE_PREFIX}params.bad`]: "{not json" });
    expect(readParams("nope", s)).toEqual({ temperature: null, topP: null, maxTokens: null, ...X });
    expect(readParams("bad", s)).toEqual({ temperature: null, topP: null, maxTokens: null, ...X });
  });

  it("removes the key when every param is reset to default (no row of nulls)", () => {
    const s = fakeStorage();
    writeParams("c1", { temperature: 1, topP: null, maxTokens: null, ...X }, s);
    expect(Object.keys(s.dump())).toHaveLength(1);
    writeParams("c1", { temperature: null, topP: null, maxTokens: null, ...X }, s);
    expect(Object.keys(s.dump())).toHaveLength(0);
  });

  it("re-validates on read, so a value written by another app version can't reach the wire", () => {
    const s = fakeStorage({
      [`${CHAT_STORAGE_PREFIX}params.c1`]: JSON.stringify({ temperature: 99, topP: 0.5, maxTokens: 10, ...X }),
    });
    expect(readParams("c1", s)).toEqual({ temperature: null, topP: 0.5, maxTokens: 10, ...X });
  });
});

describe("clearChatStorage (Rule 9: sign-out)", () => {
  it("removes ALL prefixed keys — including every per-conversation key — and nothing else", () => {
    const s = fakeStorage({
      [`${CHAT_STORAGE_PREFIX}lastModel`]: "gpt-4o",
      [`${CHAT_STORAGE_PREFIX}params.a`]: "{}",
      [`${CHAT_STORAGE_PREFIX}params.b`]: "{}",
      [`${CHAT_STORAGE_PREFIX}params.c`]: "{}",
      "theme": "dark", // device preference — must survive (see lib/client-cache.ts)
      "unrelated": "keep",
    });
    clearChatStorage(s);
    expect(s.dump()).toEqual({ theme: "dark", unrelated: "keep" });
  });

  it("does not skip entries when removing while iterating (snapshot-then-remove)", () => {
    // 7 consecutive prefixed keys: naive index-walk-and-remove skips every other one.
    const seed: Record<string, string> = {};
    for (let i = 0; i < 7; i++) seed[`${CHAT_STORAGE_PREFIX}params.${i}`] = "{}";
    const s = fakeStorage(seed);
    clearChatStorage(s);
    expect(Object.keys(s.dump())).toHaveLength(0);
  });

  it("is a no-op (and does not throw) without storage", () => {
    expect(() => clearChatStorage(undefined)).not.toThrow();
  });
});

describe("sign-out integration", () => {
  beforeEach(() => {
    // window is undefined under vitest `environment: "node"`, so the
    // default-storage path is a no-op; this asserts the registration itself
    // is safe to trigger through the real registry.
  });

  it("clearAllClientCaches() runs the registered chat clearer without throwing", async () => {
    await expect(clearAllClientCaches()).resolves.toBeUndefined();
  });
});

describe("P6.6 reasoning effort and search switch", () => {
  it("sanitizeParams keeps low/medium/high and drops anything else to null", () => {
    for (const e of ["low", "medium", "high"] as const) {
      expect(sanitizeParams({ reasoningEffort: e }).reasoningEffort).toBe(e);
    }
    for (const bad of ["LOW", "max", "", 1, null, {}, undefined]) {
      expect(sanitizeParams({ reasoningEffort: bad }).reasoningEffort).toBeNull();
    }
  });

  it("webSearch is true only for the boolean true", () => {
    expect(sanitizeParams({ webSearch: true }).webSearch).toBe(true);
    for (const bad of ["true", 1, null, undefined]) expect(sanitizeParams({ webSearch: bad }).webSearch).toBe(false);
  });

  it("restores the stored effort per conversation, independently", () => {
    const s = fakeStorage();
    writeParams("c1", { ...DEFAULT_CONVERSATION_PARAMS, reasoningEffort: "high" }, s);
    writeParams("c2", { ...DEFAULT_CONVERSATION_PARAMS, reasoningEffort: "low" }, s);
    expect(readParams("c1", s).reasoningEffort).toBe("high");
    expect(readParams("c2", s).reasoningEffort).toBe("low");
    expect(readParams("c3", s).reasoningEffort).toBeNull();
  });

  it("an effort alone keeps the key; resetting it to model default removes the key", () => {
    const s = fakeStorage();
    writeParams("c1", { ...DEFAULT_CONVERSATION_PARAMS, reasoningEffort: "medium" }, s);
    expect(Object.keys(s.dump())).toHaveLength(1);
    writeParams("c1", DEFAULT_CONVERSATION_PARAMS, s);
    expect(Object.keys(s.dump())).toHaveLength(0);
  });

  it("is cleared on sign-out with the other chat keys", () => {
    const s = fakeStorage();
    writeParams("c1", { ...DEFAULT_CONVERSATION_PARAMS, reasoningEffort: "high" }, s);
    clearChatStorage(s);
    expect(Object.keys(s.dump())).toHaveLength(0);
  });
});
