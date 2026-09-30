import { describe, it, expect, vi } from "vitest";
import type { Queue } from "bullmq";
import { upsertRepeatable } from "./repeat-jobs";

function fakeQueue(existing: Array<{ key: string; name: string; pattern: string | null }>) {
  return {
    getRepeatableJobs: vi.fn(async () => existing),
    removeRepeatableByKey: vi.fn(async () => true),
    add: vi.fn(async () => ({})),
  };
}
const asQueue = (q: ReturnType<typeof fakeQueue>) => q as unknown as Queue;

describe("upsertRepeatable", () => {
  it("removes the same job scheduled with an old pattern, then adds the new one", async () => {
    const q = fakeQueue([{ key: "old-key", name: "storageSweep", pattern: "*/15 * * * *" }]);
    const r = await upsertRepeatable(asQueue(q), "storageSweep", "*/30 * * * *", "storage-sweep");
    expect(r.removed).toBe(1);
    expect(q.removeRepeatableByKey).toHaveBeenCalledWith("old-key");
    expect(q.add).toHaveBeenCalledWith("storageSweep", {}, { repeat: { pattern: "*/30 * * * *" }, jobId: "storage-sweep" });
  });
  it("leaves a current schedule and other jobs alone", async () => {
    const q = fakeQueue([
      { key: "same", name: "redisHealth", pattern: "*/30 * * * *" },
      { key: "other", name: "priceGuard", pattern: "0 4 * * *" },
    ]);
    const r = await upsertRepeatable(asQueue(q), "redisHealth", "*/30 * * * *", "redis-health");
    expect(r.removed).toBe(0);
    expect(q.removeRepeatableByKey).not.toHaveBeenCalled();
    expect(q.add).toHaveBeenCalledTimes(1);
  });
  it("works on an empty queue", async () => {
    const q = fakeQueue([]);
    expect((await upsertRepeatable(asQueue(q), "modelLatencySync", "*/30 * * * *", "model-latency-sync")).removed).toBe(0);
    expect(q.add).toHaveBeenCalledTimes(1);
  });
});
