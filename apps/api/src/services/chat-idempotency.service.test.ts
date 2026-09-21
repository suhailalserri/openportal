import { describe, it, expect, vi } from "vitest";
import { claimUserMessage, type IdempotencyRedis } from "./chat-idempotency.service";

/** Minimal in-memory stand-in for the one ioredis call this service makes
 *  (`set(key, value, "EX", seconds, "NX")`), mirroring the real SET NX
 *  semantics: returns "OK" only the first time a key is set, `null` after. */
class FakeIdempotencyRedis implements IdempotencyRedis {
  private store = new Set<string>();
  async set(key: string, _value: string, _ex: "EX", _seconds: number, _nx: "NX"): Promise<"OK" | null> {
    if (this.store.has(key)) return null;
    this.store.add(key);
    return "OK";
  }
}

describe("claimUserMessage", () => {
  it("returns true the first time a (conversationId, clientMessageId) pair is claimed", async () => {
    const redis = new FakeIdempotencyRedis();
    const claimed = await claimUserMessage(redis, "conv-1", "msg-1");
    expect(claimed).toBe(true);
  });

  it("returns false on a repeat claim of the same pair (retry/double-submit)", async () => {
    const redis = new FakeIdempotencyRedis();
    await claimUserMessage(redis, "conv-1", "msg-1");
    const second = await claimUserMessage(redis, "conv-1", "msg-1");
    expect(second).toBe(false);
  });

  it("treats the same clientMessageId in a different conversation as a distinct claim", async () => {
    const redis = new FakeIdempotencyRedis();
    const first  = await claimUserMessage(redis, "conv-1", "msg-1");
    const second = await claimUserMessage(redis, "conv-2", "msg-1");
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it("fails OPEN (returns true) when Redis errors — a fraud/Redis outage must never drop a real message", async () => {
    const redis: IdempotencyRedis = {
      set: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };
    const claimed = await claimUserMessage(redis, "conv-1", "msg-1");
    expect(claimed).toBe(true);
  });
});
