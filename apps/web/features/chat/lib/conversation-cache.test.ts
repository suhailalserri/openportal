import { describe, it, expect } from "vitest";

import {
  readCachedConversationList,
  writeCachedConversationList,
  readCachedMessages,
  writeCachedMessages,
  deleteCachedMessages,
  clearConversationCacheForUser,
  CACHE_PREFIX,
  type KVStore,
} from "./conversation-cache";
import type { ChatMessage, ConversationSummary } from "../types";

/** Plain in-memory Map standing in for idb-keyval — see conversation-
 *  cache.ts's header comment for why this is the boundary tests stop at. */
function fakeStore(initial: Record<string, unknown> = {}): KVStore & { raw: Map<string, unknown> } {
  const raw = new Map<string, unknown>(Object.entries(initial));
  return {
    raw,
    get: async (key) => raw.get(key),
    set: async (key, value) => {
      raw.set(key, value);
    },
    del: async (key) => {
      raw.delete(key);
    },
  };
}

function throwingStore(): KVStore {
  return {
    get: async () => {
      throw new Error("boom");
    },
    set: async () => {
      throw new Error("boom");
    },
    del: async () => {
      throw new Error("boom");
    },
  };
}

const conv = (id: string): ConversationSummary => ({
  id,
  title: `Conversation ${id}`,
  modelId: "gpt-4o",
  isPinned: false,
  updatedAt: new Date().toISOString(),
});

const msg = (id: string): ChatMessage => ({
  id,
  role: "user",
  content: "hi",
  createdAt: new Date().toISOString(),
  isPartial: false,
});

describe("conversation list cache", () => {
  it("round-trips the list", async () => {
    const store = fakeStore();
    await writeCachedConversationList("u1", [conv("a"), conv("b")], store);
    expect(await readCachedConversationList("u1", store)).toEqual([conv("a"), conv("b")]);
  });

  it("keys are namespaced by user id", async () => {
    const store = fakeStore();
    await writeCachedConversationList("u1", [conv("a")], store);
    expect(await readCachedConversationList("u2", store)).toBeUndefined();
    expect([...store.raw.keys()]).toEqual([`${CACHE_PREFIX}u1.list`]);
  });

  it("returns undefined on a cache miss rather than throwing", async () => {
    const store = fakeStore();
    expect(await readCachedConversationList("nobody", store)).toBeUndefined();
  });

  it("a store that throws never propagates (read and write both degrade silently)", async () => {
    const store = throwingStore();
    await expect(writeCachedConversationList("u1", [conv("a")], store)).resolves.toBeUndefined();
    await expect(readCachedConversationList("u1", store)).resolves.toBeUndefined();
  });
});

describe("per-conversation message cache", () => {
  it("round-trips messages for one conversation", async () => {
    const store = fakeStore();
    await writeCachedMessages("u1", "c1", [msg("m1"), msg("m2")], store);
    expect(await readCachedMessages("u1", "c1", store)).toEqual([msg("m1"), msg("m2")]);
  });

  it("two conversations for the same user don't collide", async () => {
    const store = fakeStore();
    await writeCachedMessages("u1", "c1", [msg("m1")], store);
    await writeCachedMessages("u1", "c2", [msg("m2")], store);
    expect(await readCachedMessages("u1", "c1", store)).toEqual([msg("m1")]);
    expect(await readCachedMessages("u1", "c2", store)).toEqual([msg("m2")]);
  });

  it("the same conversation id for two different users doesn't collide (namespacing)", async () => {
    const store = fakeStore();
    await writeCachedMessages("u1", "shared-id", [msg("from-u1")], store);
    await writeCachedMessages("u2", "shared-id", [msg("from-u2")], store);
    expect(await readCachedMessages("u1", "shared-id", store)).toEqual([msg("from-u1")]);
    expect(await readCachedMessages("u2", "shared-id", store)).toEqual([msg("from-u2")]);
  });

  it("deleteCachedMessages removes just that conversation's entry", async () => {
    const store = fakeStore();
    await writeCachedMessages("u1", "c1", [msg("m1")], store);
    await writeCachedMessages("u1", "c2", [msg("m2")], store);
    await deleteCachedMessages("u1", "c1", store);
    expect(await readCachedMessages("u1", "c1", store)).toBeUndefined();
    expect(await readCachedMessages("u1", "c2", store)).toEqual([msg("m2")]);
  });

  it("evicts the least-recently-written conversation once the cap is exceeded", async () => {
    const store = fakeStore();
    // Cap is 30; write 31 distinct conversations, oldest (c0) should be evicted.
    for (let i = 0; i < 31; i++) {
      await writeCachedMessages("u1", `c${i}`, [msg(`m${i}`)], store);
    }
    expect(await readCachedMessages("u1", "c0", store)).toBeUndefined();
    expect(await readCachedMessages("u1", "c30", store)).toEqual([msg("m30")]);
  });

  it("re-writing an already-cached conversation refreshes its recency without evicting it early", async () => {
    const store = fakeStore();
    for (let i = 0; i < 30; i++) {
      await writeCachedMessages("u1", `c${i}`, [msg(`m${i}`)], store);
    }
    // c0 is now the oldest. Touch it again...
    await writeCachedMessages("u1", "c0", [msg("m0-updated")], store);
    // ...then push one more NEW conversation past the cap. c1 (now oldest) should be evicted, not c0.
    await writeCachedMessages("u1", "c31", [msg("m31")], store);
    expect(await readCachedMessages("u1", "c0", store)).toEqual([msg("m0-updated")]);
    expect(await readCachedMessages("u1", "c1", store)).toBeUndefined();
  });
});

describe("clearConversationCacheForUser", () => {
  it("removes the list, the index, and every cached conversation for that user only", async () => {
    const store = fakeStore();
    await writeCachedConversationList("u1", [conv("a")], store);
    await writeCachedMessages("u1", "c1", [msg("m1")], store);
    await writeCachedMessages("u1", "c2", [msg("m2")], store);
    await writeCachedConversationList("u2", [conv("z")], store);
    await writeCachedMessages("u2", "c9", [msg("m9")], store);

    await clearConversationCacheForUser("u1", store);

    expect(await readCachedConversationList("u1", store)).toBeUndefined();
    expect(await readCachedMessages("u1", "c1", store)).toBeUndefined();
    expect(await readCachedMessages("u1", "c2", store)).toBeUndefined();
    // u2's entries are untouched — this is the Rule 9 guarantee under test.
    expect(await readCachedConversationList("u2", store)).toEqual([conv("z")]);
    expect(await readCachedMessages("u2", "c9", store)).toEqual([msg("m9")]);
  });

  it("clearing a user with nothing cached does not throw", async () => {
    const store = fakeStore();
    await expect(clearConversationCacheForUser("ghost", store)).resolves.toBeUndefined();
  });

  it("is safe against a throwing store", async () => {
    const store = throwingStore();
    await expect(clearConversationCacheForUser("u1", store)).resolves.toBeUndefined();
  });
});
