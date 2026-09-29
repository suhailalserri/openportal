import { describe, it, expect, vi } from "vitest";
import { closeRedisClient, type ClosableRedis } from "./redis-close";

const fake = (status: string, quit: () => Promise<unknown>): ClosableRedis & { disconnect: ReturnType<typeof vi.fn>; quit: ReturnType<typeof vi.fn> } =>
  ({ status, quit: vi.fn(quit), disconnect: vi.fn() });

describe("closeRedisClient", () => {
  it("never-connected client (lazyConnect): disconnect only, no QUIT", async () => {
    const c = fake("wait", async () => "OK");
    await closeRedisClient(c);
    expect(c.quit).not.toHaveBeenCalled();
    expect(c.disconnect).toHaveBeenCalledOnce();
  });
  it("connected client: QUIT, no forced disconnect", async () => {
    const c = fake("ready", async () => "OK");
    await closeRedisClient(c);
    expect(c.quit).toHaveBeenCalledOnce();
    expect(c.disconnect).not.toHaveBeenCalled();
  });
  it("QUIT that hangs falls back to disconnect after the timeout", async () => {
    const c = fake("ready", () => new Promise(() => {}));
    await closeRedisClient(c, 20);
    expect(c.disconnect).toHaveBeenCalledOnce();
  });
  it("QUIT that rejects falls back to disconnect and never throws", async () => {
    const c = fake("ready", () => Promise.reject(new Error("Connection is closed.")));
    await expect(closeRedisClient(c)).resolves.toBeUndefined();
    expect(c.disconnect).toHaveBeenCalledOnce();
  });
});
