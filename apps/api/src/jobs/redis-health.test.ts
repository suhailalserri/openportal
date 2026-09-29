import { describe, it, expect, vi } from "vitest";
import {
  checkEvictionPolicy, checkMemory, parseMemoryInfo, createRedisHealthMonitor,
  type RedisHealthClient,
} from "./redis-health";

const client = (policy: string | Error, memory: string | Error): RedisHealthClient => ({
  call: async () => { if (policy instanceof Error) throw policy; return ["maxmemory-policy", policy]; },
  info: async () => { if (memory instanceof Error) throw memory; return memory; },
});
const mem = (used: number, max: number) => `# Memory\r\nused_memory:${used}\r\nmaxmemory:${max}\r\n`;

describe("redis eviction policy check (N1)", () => {
  it("noeviction is ok", async () => {
    expect(await checkEvictionPolicy(client("noeviction", mem(1, 10)))).toEqual({ status: "ok", policy: "noeviction" });
  });
  it.each(["allkeys-lru", "volatile-lru", "allkeys-random", "volatile-ttl"])("%s is bad", async (p) => {
    expect(await checkEvictionPolicy(client(p, mem(1, 10)))).toEqual({ status: "bad", policy: p });
  });
  it("CONFIG blocked by the provider -> unknown, never throws", async () => {
    expect((await checkEvictionPolicy(client(new Error("ERR unknown command"), mem(1, 10)))).status).toBe("unknown");
  });
});

describe("redis memory check", () => {
  it("parses INFO memory (CRLF)", () => {
    expect(parseMemoryInfo(mem(700, 1000))).toEqual({ used: 700, max: 1000 });
  });
  it("below 70% ok, at 70% high", async () => {
    expect((await checkMemory(client("noeviction", mem(699, 1000)))).status).toBe("ok");
    expect((await checkMemory(client("noeviction", mem(700, 1000)))).status).toBe("high");
  });
  it("maxmemory 0 or INFO failing -> unknown", async () => {
    expect((await checkMemory(client("noeviction", mem(500, 0)))).status).toBe("unknown");
    expect((await checkMemory(client("noeviction", new Error("nope")))).status).toBe("unknown");
  });
});

describe("redis health monitor", () => {
  function setup() {
    let t = 0;
    const alert = vi.fn(); const report = vi.fn(); const log = vi.fn();
    const monitor = createRedisHealthMonitor({ alert, report, log, now: () => t });
    return { monitor, alert, report, log, advance: (ms: number) => { t += ms; } };
  }

  it("healthy Redis raises nothing", async () => {
    const { monitor, alert, report } = setup();
    await monitor.run(client("noeviction", mem(100, 1000)));
    expect(alert).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("bad policy -> one critical alert + one Sentry report, throttled while it persists", async () => {
    const { monitor, alert, report, advance } = setup();
    const bad = client("allkeys-lru", mem(100, 1000));
    await monitor.run(bad); await monitor.run(bad);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![1]).toBe("critical");
    expect(alert.mock.calls[0]![0]).toContain("allkeys-lru");
    expect(report).toHaveBeenCalledTimes(1);
    advance(7 * 3_600_000);
    await monitor.run(bad);
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it("memory >= 70% -> warning alert", async () => {
    const { monitor, alert } = setup();
    await monitor.run(client("noeviction", mem(800, 1000)));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![1]).toBe("warning");
    expect(alert.mock.calls[0]![0]).toContain("80%");
  });

  it("unknown results are logged once, not alerted", async () => {
    const { monitor, alert, log } = setup();
    const blind = client(new Error("blocked"), mem(1, 0));
    await monitor.run(blind); await monitor.run(blind);
    expect(alert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2); // one line for policy, one for memory
  });

  it("a throwing alert callback never escapes", async () => {
    const monitor = createRedisHealthMonitor({
      alert: () => { throw new Error("boom"); }, report: () => { throw new Error("boom"); },
    });
    await expect(monitor.run(client("allkeys-lru", mem(900, 1000)))).resolves.toBeDefined();
  });
});
